import { z } from "zod";
import OpenAI from "openai";

const schema = z.object({
  mood: z.string().min(1),
  minutes: z.coerce.number().int().positive().max(240), // coerce handles "20" as well
  ingredients: z.string().min(1),
  diet: z.string().optional(),
});

// Defensive extractor in case the model wraps JSON in ``` fences
function extractJsonObject(text: string) {
  // strip ```json ... ``` or ``` fences
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }
  const slice = cleaned.slice(start, end + 1);
  return JSON.parse(slice);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mood, minutes, ingredients, diet } = schema.parse(body);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `You are "MoodChef", a practical recipe assistant.
- Always fit prep+cook within the given minutes.
- Use only provided ingredients plus pantry basics (oil, salt, pepper, common spices).
- Clear steps, quantities, and one quick variation.
- If constraints are impossible, propose the closest feasible option.
- IMPORTANT: When asked for output, reply with a single JSON object only (no prose or markdown).`;

    const userBrief = [
      `Mood: ${mood}`,
      `Time available (minutes): ${minutes}`,
      `Ingredients on hand: ${ingredients}`,
      diet ? `Dietary prefs: ${diet}` : ``,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      // Try to force JSON mode (if the model supports it, great; if not, sanitizer still handles it)
      response_format: { type: "json_object" } as any,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            `Return ONLY valid JSON (no markdown, no backticks) shaped exactly as:
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
${userBrief}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    // If JSON mode worked, this is already pure JSON. If not, sanitize.
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      data = extractJsonObject(raw);
    }

    return Response.json(data, { status: 200 });
  } catch (err: any) {
    return Response.json(
      { error: err?.message ?? "Bad Request" },
      { status: 400 }
    );
  }
}
