"use client";

import { useState } from "react";

export default function Home() {
  const [mood, setMood] = useState("");
  const [minutes, setMinutes] = useState(20);
  const [ingredients, setIngredients] = useState("");
  const [diet, setDiet] = useState("");
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRecipe(null);
    try {
      const res = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, minutes, ingredients, diet }),
      });
      if (!res.ok) throw new Error("Failed to generate recipe");
      const json = await res.json();
      setRecipe(json);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-2xl w-full space-y-6">
        <header className="text-center">
          <h1 className="text-4xl font-bold text-indigo-600 mb-2">🍳 MoodChef</h1>
          <p className="text-slate-600">
            Tell me your vibe, time, and what’s in your kitchen — I’ll cook up an idea.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="card grid gap-4 bg-white"
        >
          <input
            className="border border-slate-300 rounded-xl p-3"
            placeholder="Mood (e.g., cozy, adventurous, lazy…)"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            required
          />

          <label className="label flex justify-between">
            <span>Time you can spare:</span>
            <span className="text-indigo-600 font-semibold">{minutes} min</span>
          </label>
          <input
            type="range"
            min={5}
            max={240}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(parseInt(e.target.value))}
            className="w-full accent-indigo-600"
          />

          <textarea
            className="border border-slate-300 rounded-xl p-3"
            placeholder="Ingredients on hand (comma-separated)"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            rows={3}
            required
          />

          <input
            className="border border-slate-300 rounded-xl p-3"
            placeholder="Dietary prefs (optional)"
            value={diet}
            onChange={(e) => setDiet(e.target.value)}
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 transition-all disabled:opacity-50"
          >
            {loading ? "Cooking..." : "Get Recipe"}
          </button>
        </form>

        {error && (
          <p className="text-red-600 text-center bg-red-50 border border-red-200 p-3 rounded-xl">
            {error}
          </p>
        )}

        {recipe && (
          <section className="card">
            <h2 className="text-2xl font-bold text-indigo-700 mb-2">
              {recipe.title}
            </h2>
            <p className="text-slate-600 mb-4">
              ⏱ {recipe.time_minutes} min • 👥 Serves {recipe.serves}
            </p>
            <h3 className="text-lg font-semibold mb-1">Ingredients</h3>
            <ul className="list-disc ml-6 mb-4 text-slate-700">
              {recipe.ingredients_list.map((i: string, idx: number) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
            <h3 className="text-lg font-semibold mb-1">Steps</h3>
            <ol className="list-decimal ml-6 mb-4 text-slate-700">
              {recipe.steps.map((s: string, idx: number) => (
                <li key={idx} className="mb-1">
                  {s}
                </li>
              ))}
            </ol>
            <p className="text-slate-700 mb-1">
              <b>Why it fits:</b> {recipe.why_it_fits}
            </p>
            <p className="text-slate-700">
              <b>Variation:</b> {recipe.variation}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
