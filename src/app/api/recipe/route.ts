// src/app/api/recipe/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  mood: z.string().trim().min(1),
  minutes: z.coerce.number().int().positive().max(240),
  ingredients: z.string().trim().min(1),
  diet: z.string().trim().optional(), // e.g., vegetarian, vegan, keto, paleo, gluten-free, dairy-free, halal, kosher
});

const SPOON = "https://api.spoonacular.com";
const API_KEY = process.env.SPOONACULAR_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return json({ error: "SPOONACULAR_API_KEY missing" }, 500);
    }

    const body = await req.json();
    const { mood, minutes, ingredients, diet } = schema.parse(body);

    const { dietParam, intolerances } = mapDiet(diet);
    const ingCsv = normIngredientsCSV(ingredients);

    // 1) Find candidates that actually use the given ingredients
    const findParams = new URLSearchParams({
      apiKey: API_KEY,
      ingredients: ingCsv,
      number: "8",          // grab a handful to filter
      ranking: "1",         // maximize used ingredients
      ignorePantry: "true", // salt/oil/etc assumed available
    });

    const resFind = await fetch(`${SPOON}/recipes/findByIngredients?${findParams}`, { cache: "no-store" });
    if (!resFind.ok) {
      const text = await resFind.text();
      return json({ error: `findByIngredients failed: ${resFind.status} ${text}` }, 502);
    }

    const candidates: any[] = await resFind.json();
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return json({ error: "No recipes found with your ingredients." }, 404);
    }

    // Sort: most used ingredients first, then fewest missed
    candidates.sort((a, b) => {
      const usedDiff = (b.usedIngredientCount ?? 0) - (a.usedIngredientCount ?? 0);
      if (usedDiff !== 0) return usedDiff;
      return (a.missedIngredientCount ?? 0) - (b.missedIngredientCount ?? 0);
    });

    // 2) Pull /information for each candidate to filter by time & diet
    const filtered: any[] = [];
    for (const c of candidates) {
      const infoUrl = new URL(`${SPOON}/recipes/${c.id}/information`);
      infoUrl.searchParams.set("apiKey", API_KEY);
      infoUrl.searchParams.set("includeNutrition", "false");
      const infoRes = await fetch(infoUrl, { cache: "no-store" });
      if (!infoRes.ok) continue;
      const info = await infoRes.json();

      // Time filter
      const ready = info?.readyInMinutes ?? c.readyInMinutes ?? 999;
      if (ready > minutes) continue;

      // Diet/intolerance filter (best-effort)
      if (!passesDiet(info, dietParam, intolerances)) continue;

      filtered.push({ hit: c, info });
      if (filtered.length >= 3) break; // keep it snappy
    }

    // If none passed strict filters, relax to top candidate anyway
    const pick = filtered[0] ?? (candidates.length ? { hit: candidates[0], info: null } : null);
    if (!pick) {
      return json({ error: "No suitable recipe matched your time/diet filters." }, 404);
    }

    // 3) Get nice step-by-step instructions
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
    const title = info?.title ?? pick.hit.title ?? "Recipe";
    const time_minutes = Math.min(info?.readyInMinutes ?? pick.hit.readyInMinutes ?? minutes, minutes);
    const serves = info?.servings ?? 2;

    const ingredients_list = buildIngredientList(pick.hit, info);
    if (steps.length === 0) {
      const fallback = extractStepsFromHtml(info?.summary || info?.instructions || "");
      steps = fallback.length ? fallback : ["Open the linked recipe page and follow the instructions."];
    }

    const why_it_fits = buildWhy(mood, time_minutes, ingCsv, diet);
    const variation = buildVariation(pick.hit, info);

    return json({
      title,
      time_minutes,
      serves,
      ingredients_list,
      steps,
      why_it_fits,
      variation,
    });

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

function normIngredientsCSV(s: string) {
  return s
    .split(/[,;\n ]+/) // split by comma/semicolon/newline/space
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join(",");
}

function mapDiet(raw?: string): { dietParam: string; intolerances: string[] } {
  if (!raw) return { dietParam: "", intolerances: [] };
  const s = raw.toLowerCase();

  // Spoonacular "diet" enum
  const dietParam =
    s.includes("vegan") ? "vegan" :
    s.includes("vegetarian") ? "vegetarian" :
    s.includes("pescatarian") ? "pescetarian" :
    s.includes("keto") ? "ketogenic" :
    s.includes("paleo") ? "paleo" :
    s.includes("low fodmap") ? "low FODMAP" :
    s.includes("whole30") ? "whole30" :
    "";

  // Intolerances (Spoonacular recognized)
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

  // Basic booleans from /information
  if (dietParam === "vegan" && info.vegan === false) return false;
  if (dietParam === "vegetarian" && info.vegetarian === false) return false;
  if (dietParam === "pescetarian" && !hasDiet(info, "pescatarian")) return false;
  if (dietParam === "ketogenic" && !hasDiet(info, "ketogenic")) return false;
  if (dietParam === "paleo" && !hasDiet(info, "paleo")) return false;
  if (dietParam === "low FODMAP" && !hasDiet(info, "low fodmap")) return false;
  if (dietParam === "whole30" && !hasDiet(info, "whole 30")) return false;

  // Intolerances best-effort check via extendedIngredients
  if (Array.isArray(info.extendedIngredients) && intolerances.length) {
    const lowerList = info.extendedIngredients.map((i: any) =>
      (i?.original ?? i?.name ?? "").toString().toLowerCase()
    );
    for (const t of intolerances) {
      // extremely rough matching to signal likely conflicts
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

function extractStepsFromHtml(html: string): string[] {
  if (!html) return [];
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parts = text
    .split(/(?:(?:Step|Étape|Paso)\s*\d+[:.)-]\s*)|(?<=\.)\s+/i)
    .map(s => s.trim())
    .filter(s => s.length > 6);
  return parts.slice(0, 10);
}

function buildWhy(mood: string, time: number, ingCsv: string, diet?: string) {
  const top = ingCsv.split(",").slice(0, 5).join(", ");
  const more = ingCsv.split(",").length > 5 ? "…" : "";
  return [
    `Matches your mood: ${mood}.`,
    `Fits your time (~${time} min).`,
    ingCsv ? `Uses your ingredients: ${top}${more}.` : "",
    diet ? `Diet preference: ${diet}.` : "",
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
