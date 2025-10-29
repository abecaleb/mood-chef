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

    // Try Spoonacular first if API key exists
    const spoonKey = process.env.SPOONACULAR_API_KEY;
    if (spoonKey) {
      const q = encodeURIComponent(ingredients);
      const url = `https://api.spoonacular.com/recipes/complexSearch?query=${q}${
        cuisine ? `&cuisine=${encodeURIComponent(cuisine)}` : ""
      }${diet ? `&diet=${encodeURIComponent(diet)}` : ""}&addRecipeInformation=true&number=1&apiKey=${spoonKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.results?.length) {
          const r = data.results[0];
          return Response.json({
            title: r.title,
            time_minutes: r.readyInMinutes,
            serves: r.servings,
            ingredients_list: r.extendedIngredients?.map((i: any) => i.original) ?? [],
            steps:
              r.analyzedInstructions?.[0]?.steps?.map((s: any) => s.step) ??
              ["Combine ingredients and cook as desired."],
            why_it_fits: `Matches your mood (${mood}), fits your time (${minutes} min), and suits your ${cuisine || "chosen"} cuisine.`,
            variation: "Try adding your personal twist — garnish or spice variation.",
          });
        }
      }
    }

    // fallback → OpenAI if Spoonacular fails
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = `You are "MoodChef", a helpful recipe assistant.
- Always fit prep+cook time within the given minutes.
- Use the listed ingredients (plus pantry basics).
- If 'onlyThese' is true, avoid adding other ingredients.
- If cuisine is provided, use its authent
