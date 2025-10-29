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

    const system = `You are "MoodChef", a helpful, creative recipe assistant.
- Fit total time within the given minutes.
- Always use the provided ingredients prominently.
- If 'onlyThese' is true, avoid adding any other major ingredients (besides pantry staples like salt, oil, pepper, sugar, spices).
- If 'onlyThese' is false, you may add other *common complementary ingredients* that make sense with the given items.
- If a cuisine is provided, keep flavours and methods true to that cuisine.
- Always return valid JSON with title, time_minutes, serves, ingredients_list, steps, why_it_fits, and variation.`;

    const user = [
      `Mood: ${mood}`,
      `Time available: ${minutes} minutes`,
      `Ingredients: ${ingredients}`,
      diet ? `Dietary preference: ${diet}` : "",
      onlyThese ? `Constraint: Use only these ingredients (+ pantry staples)` : "",
      cuisine ? `Cuisine focus: ${cuisine}` : "",
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

Brief:
${user}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const clean = raw.replace(/```json|```/g, "");
    return new Response(clean, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = String(err?.message || "").toLowerCase();

    let status = 500;
    let error = "Something went wrong. Please try again in a moment.";

    // Quota/limit/paid-plan errors (e.g., 402/429 from a provider)
    if (msg.includes("402") || msg.includes("429") || msg.includes("quota") || msg.includes("limit")) {
      status = 429;
      error = "We’ve hit today’s recipe lookup limit. Please try again later or tweak your inputs.";
    }

    // Bad input / validation problems
    if (msg.includes("zod") || msg.includes("invalid") || msg.includes("parse")) {
      status = 400;
      error = "Please check your inputs and try again.";
    }

    // Never leak upstream/provider messages to end users
    console.error(`[MoodChef ${requestId}] API error:`, err);

    return new Response(JSON.stringify({ error, requestId }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
