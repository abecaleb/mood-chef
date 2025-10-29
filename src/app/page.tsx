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
  try {
    const body = await req.json();
    const { mood, minutes, ingredients, diet, onlyThese, cuisine } = schema.parse(body);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `You are "MoodChef", a friendly, practical recipe assistant.
- Always fit prep+cook within the given minutes.
- Use only the provided ingredients plus pantry basics (oil, salt, pepper, common spices).
- If "onlyThese" is true, avoid adding ingredients not listed (except pantry basics).
- Prefer dishes that match the specified cuisine if provided.
- Offer clear steps, quantities, and a quick variation.
- If constraints are impossible, propose the closest feasible option.`;

    const user = [
      `Mood: ${mood}`,
      `Time available (minutes): ${minutes}`,
      `Ingredients on hand: ${ingredients}`,
      diet ? `Dietary preferences: ${diet}` : "",
      cuisine ? `Cuisine preference: ${cuisine}` : "",
      onlyThese ? `Restriction: Use ONLY these ingredients (apart from pantry staples).` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Create ONE recipe that fits this brief. Return JSON only:
{
  "title": "...",
  "time_minutes": <number>,
  "serves": <number>,
  "ingredients_list": ["..."],
  "steps": ["..."],
  "why_it_fits": "...",
  "variation": "..."
}

Brief:
${user}`,
        },
      ],
    });

    // Sanitize and parse JSON safely
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const text = raw
      .replace(/```json/i, "")
      .replace(/```/g, "")
      .trim();

    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("❌ Error in /api/recipe:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Something went wrong" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
