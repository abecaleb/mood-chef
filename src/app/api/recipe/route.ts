// src/app/api/recipe/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  mood: z.string().trim().min(1),                 // we’ll just surface mood in “why_it_fits”
  minutes: z.coerce.number().int().positive().max(240),
  ingredients: z.string().trim().min(1),
  diet: z.string().trim().optional(),             // e.g. vegetarian, vegan, gluten free, halal, etc.
});

const SPOONACULAR = "https://api.spoonacular.com";
const apiKey = process.env.SPOONACULAR_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    if (!apiKey) {
      return Response.json({ error: "SPOONACULAR_API_KEY missing" }, { status: 500 });
    }

    const body = await req.json();
    const { mood, minutes, ingredients, diet } = schema.parse(body);

    // Parse and normalize ingredients into comma-separated list Spoonacular expects
    const ingList = ingredients
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 20)                                  // keep it reasonable
      .join(",");

    // Map diet string to Spoonacular parameters
    // For strict vegetarian/vegan/keto/paleo etc. use `diet=...`
    // For halal/kosher use `intolerances` or rely on tags later (Spoonacular has limited support)
    const dietParam = normalizeDietToSpoonacular(diet);

    // Step 1: find the best recipe(s) that use the most of your ingredients within time
    // Endpoint: /recipes/complexSearch
    const params = new URLSearchParams({
      apiKey,
      addRecipeInformation: "true",   // brings back servings, readyInMinutes, summary, etc.
      fillIngredients: "true",
      number: "1",                     // just 1 top hit
      sort: "max-used-ingredients",
      instructionsRequired: "true",
      ignorePantry: "true",
      includeIngredients: ingList,
      maxReadyTime: String(minutes),
    });

    if (dietParam.diet) params.set("diet", dietParam.diet);
    if (dietParam.intolerances) params.set("intolerances", dietParam.intolerances);

    const searchRes = await fetch(`${SPOONACULAR}/recipes/complexSearch?${params.toString()}`, {
      headers: { "Content-Type": "application/json" },
      // Next.js Edge runtime tip: ensure server-side; no caching for now
      cache: "no-store",
    });

    if (!searchRes.ok) {
      const text = await searchRes.text();
      return Response.json({ error: `Spoonacular search failed: ${searchRes.status} ${text}` }, { status: 502 });
    }

    const searchJson = await searchRes.json() as {
      results: Array<any>;
      totalResults: number;
    };

    if (!searchJson.results?.length) {
      return Response.json({
        error: "No recipes found that fit your time/ingredients.",
        hint: "Try reducing restrictions or adding more common ingredients."
      }, { status: 404 });
    }

    const hit = searchJson.results[0];
    const id = hit.id as number;

    // Step 2: get full analyzed instructions for clean step-by-step
    // Endpoint: /recipes/{id}/analyzedInstructions
    const instRes = await fetch(`${SPOONACULAR}/recipes/${id}/analyzedInstructions?apiKey=${apiKey}`, {
      cache: "no-store",
    });

    // Not all recipes have analyzedInstructions; fall back gracefully
    let steps: string[] = [];
    if (instRes.ok) {
      const inst = await instRes.json() as Array<{ steps: Array<{ number: number; step: string }> }>;
      if (Array.isArray(inst) && inst.length && Array.isArray(inst[0].steps)) {
        steps = inst[0].steps.map(s => s.step.trim()).filter(Boolean);
      }
    }

    // Build a consistent response shape for your UI
    const title: string = hit.title ?? "Recipe";
    const time_minutes: number = hit.readyInMinutes ?? Math.min(minutes, 60);
    const serves: number = hit.servings ?? 2;

    // Prefer “missedIngredients + usedIngredients” from search hit (already filled if fillIngredients=true)
    const ingredients_list: string[] = collectIngredients(hit);

    // If steps were empty, try to derive from summary/instructions fields
    if (steps.length === 0) {
      const fallback = extractStepsFromHtml(hit.summary || hit.instructions || "");
      if (fallback.length) steps = fallback;
      // still empty? at least provide a single-instruction fallback
      if (steps.length === 0) steps = ["Follow the instructions on the recipe page."];
    }

    const why_it_fits = [
      mood ? `Matches your mood: ${mood}.` : "",
      `Fits your time (~${time_minutes} min).`,
      ingList ? `Uses your ingredients: ${ingList.split(",").slice(0,5).join(", ")}${ingList.split(",").length>5?"…":""}.` : "",
      diet ? `Diet preference: ${diet}.` : ""
    ].filter(Boolean).join(" ");

    // quick variation suggestion using missed ingredients or cuisine tags if available
    const variation = craftVariation(hit);

    return Response.json({
      title,
      time_minutes,
      serves,
      ingredients_list,
      steps,
      why_it_fits,
      variation,
    }, { status: 200 });

  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Bad Request" }, { status: 400 });
  }
}

// ---------- helpers ----------

function normalizeDietToSpoonacular(raw?: string) {
  if (!raw) return { diet: "", intolerances: "" };
  const s = raw.toLowerCase();

  // Map common strings to Spoonacular diet param
  const knownDiet =
    s.includes("vegan") ? "vegan" :
    s.includes("vegetarian") ? "vegetarian" :
    s.includes("pescatarian") ? "pescetarian" :
    s.includes("keto") ? "ketogenic" :
    s.includes("paleo") ? "paleo" :
    s.includes("low fodmap") ? "low FODMAP" :
    s.includes("whole30") ? "whole30" :
    s.includes("gluten") && s.includes("free") ? "" : // goes to intolerance instead
    "";

  // intolerances: comma-separated (gluten, dairy, peanut, sesame, etc.)
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

  // “halal/kosher” don’t have first-class filters; you may post-filter by `dishTypes`/`cuisines`
  return {
    diet: knownDiet,
    intolerances: intolerances.join(","),
  };
}

function collectIngredients(hit: any): string[] {
  const out: string[] = [];
  const push = (arr?: any[]) => {
    if (Array.isArray(arr)) {
      for (const i of arr) {
        const name = i?.original ?? i?.name ?? i?.originalName;
        if (name && !out.includes(name)) out.push(name);
      }
    }
  };
  push(hit.usedIngredients);
  push(hit.missedIngredients);
  // Sometimes addRecipeInformation gives extendedIngredients
  push(hit.extendedIngredients);
  return out.length ? out : [];
}

function extractStepsFromHtml(html: string): string[] {
  if (!html) return [];
  // quick & dirty: strip tags and split sentences
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // split on numbered bullet hints or sentences
  const parts = text.split(/(?:(?:Step|步骤|Étape)\s*\d+[:.-]\s*)|(?<=\.)\s+/i)
    .map(s => s.trim())
    .filter(s => s && s.length > 6);
  // Cap at ~10 steps
  return parts.slice(0, 10);
}

function craftVariation(hit: any): string {
  // simple heuristics from cuisines/dishTypes/missedIngredients
  const cuisines: string[] = hit.cuisines ?? [];
  const dish: string[] = hit.dishTypes ?? [];
  const missed = (hit.missedIngredients ?? []).map((m: any) => m.original).filter(Boolean);

  if (missed.length) {
    return `Try adding ${missed.slice(0, 2).join(", ")} for extra flavor.`;
  }
  if (cuisines.includes("Italian")) return "Variation: add chilli flakes and a splash of pasta water for gloss.";
  if (cuisines.includes("Mexican")) return "Variation: finish with lime juice and fresh coriander.";
  if (dish.includes("salad")) return "Variation: toss with toasted nuts or seeds for crunch.";
  return "Variation: adjust herbs/spices to match your mood (smoky paprika, zesty lemon, or fresh herbs).";
}
