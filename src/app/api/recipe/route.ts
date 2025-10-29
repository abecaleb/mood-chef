// src/app/api/recipe/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";

// ADD onlyThese (default false)
const schema = z.object({
  mood: z.string().trim().min(1),
  minutes: z.coerce.number().int().positive().max(240),
  ingredients: z.string().trim().min(1),
  diet: z.string().trim().optional(),
  onlyThese: z.boolean().optional().default(false), // NEW
});

const SPOON = "https://api.spoonacular.com";
const API_KEY = process.env.SPOONACULAR_API_KEY!;

// Pantry staples that don't disqualify a recipe if "onlyThese" is checked.
// You can edit this list to taste.
const PANTRY = [
  "salt","sea salt","kosher salt","pepper","black pepper","chilli","chili","chilli flakes","red pepper flakes",
  "oil","olive oil","vegetable oil","canola oil","sunflower oil","ghee",
  "sugar","brown sugar","caster sugar","granulated sugar",
  "vinegar","white vinegar","apple cider vinegar","balsamic vinegar","rice vinegar",
  "soy sauce","tamari","fish sauce","oyster sauce",
  "garlic","ginger",
  "flour","all purpose flour","cornstarch","baking powder","baking soda",
  "butter","water","stock","broth","lemon","lime"
].map((s) => s.toLowerCase());

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) return json({ error: "SPOONACULAR_API_KEY missing" }, 500);

    const body = await req.json();
    const { mood, minutes, ingredients, diet, onlyThese } = schema.parse(body);

    const ingCsv = normIngredientsCSV(ingredients);
    const userIngsRaw = splitCsv(ingCsv);
    const userIngs = userIngsRaw.map(normalizeIng);

    const { dietParam, intolerances } = mapDiet(diet);

    // 1) Find candidates
    const findParams = new URLSearchParams({
      apiKey: API_KEY,
      ingredients: ingCsv,
      number: "20",
      ranking: "1",
      ignorePantry: "true",
    });
    const resFind = await fetch(`${SPOON}/recipes/findByIngredients?${findParams}`, { cache: "no-store" });
    if (!resFind.ok) {
      const text = await resFind.text();
      return json({ error: `findByIngredients failed: ${resFind.status} ${text}` }, 502);
    }
    let candidates: any[] = await resFind.json();
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return json({ error: "No recipes found with your ingredients." }, 404);
    }

    // Overlap scoring
    candidates = candidates.map(r => {
      const used = (r.usedIngredients ?? []).map((i: any) => normalizeIng(i.name ?? i.original ?? ""));
      const overlap = userIngs.filter(i => used.includes(i));
      return { ...r, overlapCount: overlap.length, _overlapSet: new Set(overlap) };
    });

    // Prefer ALL, then ≥2, else fallback
    let ranked = candidates.filter(r => r.overlapCount === userIngs.length);
    if (ranked.length === 0) ranked = candidates.filter(r => r.overlapCount >= Math.min(2, userIngs.length));
    if (ranked.length === 0) ranked = candidates;

    ranked.sort((a, b) =>
      (b.overlapCount - a.overlapCount) ||
      ((a.missedIngredientCount ?? 0) - (b.missedIngredientCount ?? 0)) ||
      ((b.usedIngredientCount ?? 0) - (a.usedIngredientCount ?? 0))
    );

    // 2) Info + filters (time/diet) and NEW: onlyThese => filter missed ingredients
    const finalists: { hit: any; info: any }[] = [];
    for (const c of ranked.slice(0, 10)) {
      const infoUrl = new URL(`${SPOON}/recipes/${c.id}/information`);
      infoUrl.searchParams.set("apiKey", API_KEY);
      infoUrl.searchParams.set("includeNutrition", "false");
      const infoRes = await fetch(infoUrl, { cache: "no-store" });
      if (!infoRes.ok) continue;
      const info = await infoRes.json();

      const ready = info?.readyInMinutes ?? c.readyInMinutes ?? 999;
      if (ready > minutes) continue;
      if (!passesDiet(info, dietParam, intolerances)) continue;

      if (onlyThese) {
        const nonPantryMiss = (c.missedIngredients ?? [])
          .map((m: any) => (m?.original ?? m?.name ?? "").toString().toLowerCase())
          .filter((n: string) => !isPantry(n));
        if (nonPantryMiss.length > 0) continue; // reject if anything beyond pantry is missing
      }

      finalists.push({ hit: c, info });
      if (finalists.length >= 3) break;
    }

    const pick = finalists[0] ?? { hit: ranked[0], info: null };
    if (!pick) {
      return json(
        { error: "No suitable recipe matched your filters.", hint: onlyThese ? "Try unchecking 'only these ingredients' or add one more ingredient." : undefined },
        404
      );
    }

    // 3) Instructions
    const id = pick.hit.id;
    const instRes = await fetch(`${SPOON}/recipes/${id}/analyzedInstructions?apiKey=${API_KEY}`, { cache: "no-store" });

    let steps: string[] = [];
    if (instRes.ok) {
      const inst = await instRes.json();
      if (Array.isArray(inst) && inst.length && Array.isArray(inst[0]?.steps)) {
        steps = inst[0].steps.map((s: any) => (s?.step ?? "").toString().trim()).filter(Boolean);
      }
    }

    const info = pick.info;
    const baseTitle: string = info?.title ?? pick.hit.title ?? "Recipe";
    const usedSet = new Set<string>((pick.hit.usedIngredients ?? []).map((i: any) => normalizeIng(i.name ?? i.original ?? "")));
    const heroParts = userIngsRaw.filter((_, i) => usedSet.has(userIngs[i])).map(titleCase);
    const heroPrefix = heroParts.length ? `${heroParts.join(" • ")} — ` : "";
    const title = `${heroPrefix}${baseTitle}`;

    const time_minutes: number = Math.min(info?.readyInMinutes ?? pick.hit.readyInMinutes ?? minutes, minutes);
    const serves: number = info?.servings ?? 2;

    const ingredients_list = orderIngredientsForHero(buildIngredientList(pick.hit, info), userIngs);

    if (steps.length === 0) {
      const fallback = extractStepsFromHtml(info?.summary || info?.instructions || "");
      steps = fallback.length ? fallback : ["Open the linked recipe page and follow the instructions."];
    }

    const why_it_fits = buildWhy(mood, time_minutes, ingCsv, diet, pick.hit, userIngs.length, onlyThese);
    const variation = buildVariation(pick.hit, info);

    return json({ title, time_minutes, serves, ingredients_list, steps, why_it_fits, variation });
  } catch (err: any) {
    return json({ error: err?.message ?? "Bad Request" }, 400);
  }
}

/* ---------------- helpers ---------------- */

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function splitCsv(csv: string) {
  return csv.split(",").map(s => s.trim()).filter(Boolean);
}

function normIngredientsCSV(s: string) {
  return s
    .split(/[,;\n ]+/)
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join(",");
}

function normalizeIng(s: string) {
  return s.toLowerCase().replace(/[^a-z\s]/g, "").replace(/(es|s)\b/g, "").trim();
}

function titleCase(s: string) {
  return s.replace(/\b[a-z]/g, m => m.toUpperCase());
}

function isPantry(name: string) {
  const n = name.toLowerCase();
  if (PANTRY.includes(n)) return true;
  // loose matching for phrases like "extra virgin olive oil", "black pepper"
  return PANTRY.some(p => n.includes(p));
}

function mapDiet(raw?: string): { dietParam: string; intolerances: string[] } {
  if (!raw) return { dietParam: "", intolerances: [] };
  const s = raw.toLowerCase();

  const dietParam =
    s.includes("vegan") ? "vegan" :
    s.includes("vegetarian") ? "vegetarian" :
    s.includes("pescatarian") ? "pescetarian" :
    s.includes("keto") ? "ketogenic" :
    s.includes("paleo") ? "paleo" :
    s.includes("low fodmap") ? "low FODMAP" :
    s.includes("whole30") ? "whole30" :
    "";

  const intolerances: string[] = [];
  if (s.includes("gluten")) intolerances.push("gluten");
  if (s.includes("dairy") || s.includes("lactose")) intolerances.push("dairy");
  if (s.includes("peanut")) intolerances.push("peanut");
  if (s.includes("sesame")) intolerances.push("sesame");
  if (s.includes("soy")) intolerances.push("soy");
  if (s.includes("sulfite")) intolerances.push("sulfite");
  if (s.includes("egg")) intolerances.push("egg");
  if (s.includes("wheat")) intolerances.push("wheat");
  if (s.includes("shellfish")) intolerances.push("shellfish");
  if (s.includes("treenut") || s.includes("tree nut")) intolerances.push("tree nut");

  return { dietParam, intolerances };
}

function passesDiet(info: any, dietParam: string, intolerances: string[]): boolean {
  if (!info) return true;
  if (dietParam === "vegan" && info.vegan === false) return false;
  if (dietParam === "vegetarian" && info.vegetarian === false) return false;
  if (dietParam === "pescetarian" && !hasDiet(info, "pescatarian")) return false;
  if (dietParam === "ketogenic" && !hasDiet(info, "ketogenic")) return false;
  if (dietParam === "paleo" && !hasDiet(info, "paleo")) return false;
  if (dietParam === "low FODMAP" && !hasDiet(info, "low fodmap")) return false;
  if (dietParam === "whole30" && !hasDiet(info, "whole 30")) return false;

  if (Array.isArray(info.extendedIngredients) && intolerances.length) {
    const lowerList = info.extendedIngredients.map((i: any) =>
      (i?.original ?? i?.name ?? "").toString().toLowerCase()
    );
    for (const t of intolerances) {
      if (t === "gluten" && lowerList.some((x: string) => /(wheat|barley|rye|farro|spelt|semolina|bulgur)/.test(x))) return false;
      if (t === "dairy" && lowerList.some((x: string) => /(milk|cheese|butter|cream|yogurt)/.test(x))) return false;
      if (t === "peanut" && lowerList.some((x: string) => /\bpeanut\b/.test(x))) return false;
      if (t === "sesame" && lowerList.some((x: string) => /\bsesame\b/.test(x))) return false;
      if (t === "soy" && lowerList.some((x: string) => /\bsoy\b|\bsoya\b|\btofu\b/.test(x))) return false;
      if (t === "egg" && lowerList.some((x: string) => /\begg\b/.test(x))) return false;
      if (t === "wheat" && lowerList.some((x: string) => /\bwheat\b/.test(x))) return false;
      if (t === "shellfish" && lowerList.some((x: string) => /(shrimp|prawn|crab|lobster|clam|mussel|oyster)/.test(x))) return false;
      if (t === "tree nut" && lowerList.some((x: string) => /(almond|walnut|cashew|pistachio|pecan|hazelnut|macadamia)/.test(x))) return false;
    }
  }
  return true;
}

function hasDiet(info: any, key: string): boolean {
  const diets: string[] = info?.diets ?? [];
  return diets.some(d => d.toLowerCase() === key.toLowerCase());
}

function buildIngredientList(hit: any, info: any): string[] {
  const out: string[] = [];
  const push = (arr?: any[]) => {
    if (Array.isArray(arr)) {
      for (const i of arr) {
        const name = i?.original ?? i?.originalString ?? i?.name ?? i?.originalName;
        if (name && !out.includes(name)) out.push(name);
      }
    }
  };
  push(hit?.usedIngredients);
  push(hit?.missedIngredients);
  push(info?.extendedIngredients);
  return out.length ? out : [];
}

function orderIngredientsForHero(list: string[], userIngsNorm: string[]) {
  const norm = (s: string) => normalizeIng(s);
  const isUser = (s: string) => userIngsNorm.includes(norm(s));
  const users = list.filter(isUser);
  const others = list.filter(i => !isUser(i));
  return [...dedupe(users), ...others];
}

function dedupe(arr: string[]) {
  return Array.from(new Set(arr));
}

function extractStepsFromHtml(html: string): string[] {
  if (!html) return [];
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parts = text
    .split(/(?:(?:Step|Étape|Paso)\s*\d+[:.)-]\s*)|(?<=\.)\s+/i)
    .map(s => s.trim())
    .filter(s => s.length > 6);
  return parts.slice(0, 10);
}

function buildWhy(
  mood: string,
  time: number,
  ingCsv: string,
  diet?: string,
  hit?: any,
  totalProvided?: number,
  onlyThese?: boolean
) {
  const ingArr = splitCsv(ingCsv);
  const top = ingArr.slice(0, 5).join(", ");
  const more = ingArr.length > 5 ? "…" : "";
  const usedCount = hit?.overlapCount ?? hit?.usedIngredientCount ?? 0;
  const total = totalProvided ?? ingArr.length;

  return [
    `Matches your mood: ${mood}.`,
    `Fits your time (~${time} min).`,
    `Uses ${usedCount}/${total} of your ingredients: ${top}${more}.`,
    diet ? `Diet preference: ${diet}.` : "",
    onlyThese ? `Only-these mode: allowing pantry staples only.` : "",
  ].filter(Boolean).join(" ");
}

function buildVariation(hit: any, info: any) {
  const missed = (hit?.missedIngredients ?? []).map((m: any) => m?.original).filter(Boolean);
  if (missed.length) return `Try adding ${missed.slice(0, 2).join(", ")} for extra flavor.`;
  const cuisines: string[] = info?.cuisines ?? [];
  const dish: string[] = info?.dishTypes ?? [];
  if (cuisines.includes("Italian")) return "Variation: add chilli flakes and a splash of pasta water for gloss.";
  if (cuisines.includes("Mexican")) return "Variation: finish with lime juice and fresh coriander.";
  if (dish.includes("salad")) return "Variation: toss with toasted nuts or seeds for crunch.";
  return "Variation: adjust herbs/spices to match your mood (smoky paprika, zesty lemon, or fresh herbs).";
}
