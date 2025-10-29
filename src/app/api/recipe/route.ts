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

    const system = `You are "MoodChef", a friendly and creative recipe assistant.
- Fit total prep + cook time within the given minutes.
- Always use the provided ingredients prominently.
- If 'onlyThese' is true, avoid adding other major ingredients (besides pantry staples like salt, pepper, oil, sugar, spices).
- If 'onlyThese' is false, you may include other common complementary ingredients that make sense with the given items.
- If a cuisine is provided, stay true to that cuisine’s flavors, naming, and cooking style.
- Return strictly valid JSON with a "recipes" array containing 3 items.
- Each recipe must have: title, time_minutes, serves, ingredients_list[], steps[], why_it_fits, variation.`;

    const brief = [
      `Mood: ${mood}`,
      `Time available: ${minutes} minutes`,
      `Ingredients: ${ingredients}`,
      diet ? `Dietary preference: ${diet}` : "",
      onlyThese ? `Constraint: Use only these ingredients (+ pantry staples)` : "",
      cuisine ? `Cuisine focus: ${cuisine}` : "",
      `Number of options: 3`,
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
          content: `Create THREE different recipes that fit this brief.
Return ONLY this JSON shape:
{
  "recipes": [
    {
      "title": "...",
      "time_minutes": <number>,
      "serves": <number>,
      "ingredients_list": ["..."],
      "steps": ["..."],
      "why_it_fits": "...",
      "variation": "..."
    },
    { ... },
    { ... }
  ]
}

Brief:
${brief}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? `{"recipes":[]}`;
    const clean = raw.replace(/```json|```/g, "");
    return new Response(clean, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const msg = String(err?.message || "").toLowerCase();
    let status = 500;
    let error = "Something went wrong. Please try again in a moment.";

    if (msg.includes("402") || msg.includes("429") || msg.includes("quota") || msg.includes("limit")) {
      status = 429;
      error = "We’ve hit today’s recipe lookup limit. Please try again later or tweak your inputs.";
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
