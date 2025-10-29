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

    // 🧠 System prompt tuned for cuisine + ingredient fidelity
    const system = `You are "MoodChef", a helpful, creative recipe assistant.
- Always fit prep+cook time within the given minutes.
- Use the listed ingredients (plus common pantry basics like salt, pepper, oil, sugar).
- If 'onlyThese' is true, avoid adding any other key ingredients.
- If a cuisine is given, stay faithful to its flavors, cooking methods, and naming conventions.
- Provide clear steps, quantities, and optionally a quick variation.
- If constraints are impossible, propose the closest feasible option.`;

    // 🧾 Construct the user message
    const user = [
      `Mood: ${mood}`,
      `Time available: ${minutes} minutes`,
      `Ingredients: ${ingredients}`,
      diet ? `Dietary preference: ${diet}` : "",
      onlyThese ? `Constraint: Use only these ingredients (plus pantry staples)` : "",
      cuisine ? `Cuisine focus: ${cuisine}` : "",
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Create ONE recipe that fits the brief.
Return JSON in this format:
{
  "title": "...",
  "time_minutes": <number>,
  "serves": <number>,
  "ingredients_list": ["..."],
  "steps": ["..."],
  "why_it_fits": "...",
  "variation": "..."
}
\n\nBrief:\n${user}`,
        },
      ],
    });

    // Parse JSON safely (strip markdown if model adds it)
    const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const clean = text.replace(/```json|```/g, "");
    return new Response(clean, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Bad Request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
