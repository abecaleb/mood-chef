export const runtime = "edge";
export const preferredRegion = ["syd1", "sin1", "hnd1"];

import { z } from "zod";
import OpenAI from "openai";

const schema = z.object({
  mood: z.string().min(1),
  minutes: z.number().int().positive().max(240),
  ingredients: z.string().min(1),
  diet: z.string().optional(),
  onlyThese: z.boolean().optional(),
  cuisine: z.string().optional(),
});

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).slice(2, 9);

  try {
    const body = await req.json();
    const { mood, minutes, ingredients, diet, onlyThese, cuisine } = schema.parse(body);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = (index: number) => `You are "MoodChef", a friendly recipe assistant.
- Generate 2 unique recipes that fit the brief below.
- Recipes in batch ${index} must differ from earlier ones.
- Each recipe must fit within ${minutes} minutes and include the key ingredients.
- Use JSON format: {"recipes":[{title,time_minutes,serves,ingredients_list[],steps[],why_it_fits,variation},...]}.
- Keep steps ≤6 and ingredient names short.`;

    const brief = [
      `Mood: ${mood}`,
      `Time available: ${minutes} minutes`,
      `Ingredients: ${ingredients}`,
      diet ? `Dietary preference: ${diet}` : "",
      onlyThese ? `Constraint: ONLY these ingredients (+ pantry staples)` : "",
      cuisine ? `Cuisine focus: ${cuisine}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const makeCall = (batch: number) =>
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        max_output_tokens: 650,
        messages: [
          { role: "system", content: system(batch) },
          {
            role: "user",
            content:
              `Create exactly 2 different recipes that fit this brief.\n` +
              `Return STRICT JSON only.\n\nBrief:\n${brief}`,
          },
        ],
      });

    // 🔹 Run two calls in parallel
    const [res1, res2] = await Promise.allSettled([makeCall(1), makeCall(2)]);

    const parse = (r: any) => {
      try {
        const txt = r?.value?.choices?.[0]?.message?.content?.trim() ?? "{}";
        return JSON.parse(txt.replace(/```json|```/g, ""));
      } catch {
        return { recipes: [] };
      }
    };

    const recipesA = res1.status === "fulfilled" ? parse(res1).recipes || [] : [];
    const recipesB = res2.status === "fulfilled" ? parse(res2).recipes || [] : [];

    // 🔹 Merge and de-dupe by title
    const seen = new Set<string>();
    const merged = [...recipesA, ...recipesB].filter((r) => {
      const t = r?.title?.trim().toLowerCase();
      if (!t || seen.has(t)) return false;
      seen.add(t);
      return true;
    });

    return new Response(JSON.stringify({ recipes: merged.slice(0, 4) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = String(err?.message || "").toLowerCase();
    let status = 500;
    let error = "Something went wrong. Please try again in a moment.";
    if (msg.includes("402") || msg.includes("429") || msg.includes("quota") || msg.includes("limit")) {
      status = 429;
      error =
        "We’ve hit today’s recipe lookup limit. Please try again later or tweak your inputs.";
    }
    if (msg.includes("zod") || msg.includes("invalid") || msg.includes("parse")) {
      status = 400;
      error = "Please check your inputs and try again.";
    }
    console.error(`[MoodChef ${requestId}] API error:`, err);
    return new Response(JSON.stringify({ error, requestId }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
