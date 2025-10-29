export const runtime = "edge";
export const preferredRegion = ["syd1", "sin1", "hnd1"];

import { z } from "zod";
import OpenAI from "openai";

// 👉 set how many you want (3 or 4)
const NUM_RECIPES = 3;

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

    const system = `You are "MoodChef", a friendly recipe assistant.
- Fit prep+cook within the minutes.
- Use provided ingredients prominently.
- If 'onlyThese' is true, avoid other major ingredients (besides pantry staples).
- If false, you MAY add a few common complementary ingredients.
- If a cuisine is provided, stay true to it.
- Return STRICT JSON: {"recipes":[...]} with EXACTLY ${NUM_RECIPES} items.
- Steps ≤ 6, ingredient names short.`;

    const brief = [
      `Mood: ${mood}`,
      `Time available: ${minutes} minutes`,
      `Ingredients: ${ingredients}`,
      diet ? `Diet: ${diet}` : "",
      onlyThese ? `Constraint: ONLY these (+ pantry staples)` : "",
      cuisine ? `Cuisine: ${cuisine}` : "",
    ].filter(Boolean).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      // bump tokens slightly if you go to 4 recipes
      max_tokens: NUM_RECIPES >= 4 ? 900 : 750,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            `Create EXACTLY ${NUM_RECIPES} different recipes that fit this brief.\n` +
            `Return ONLY this JSON (no commentary):\n` +
            `{"recipes":[{"title":"...","time_minutes":30,"serves":2,"ingredients_list":["..."],"steps":["..."],"why_it_fits":"...","variation":"..."} ...]}\n\n` +
            `Brief:\n${brief}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? `{"recipes":[]}`;
    const clean = raw.replace(/```json|```/g, "");
    return new Response(clean, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    const msg = String(err?.message || "").toLowerCase();
    let status = 500;
    let error = "Something went wrong. Please try again in a moment.";
    if (msg.includes("402") || msg.includes("429") || msg.includes("quota") || msg.includes("limit")) {
      status = 429; error = "We’ve hit today’s recipe lookup limit. Please try again later or tweak your inputs.";
    }
    if (msg.includes("zod") || msg.includes("invalid") || msg.includes("parse")) {
      status = 400; error = "Please check your inputs and try again.";
    }
    console.error(`[MoodChef ${requestId}] API error:`, err);
    return new Response(JSON.stringify({ error, requestId }), { status, headers: { "Content-Type": "application/json" } });
  }
}
