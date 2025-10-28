"use client";

import { useState } from "react";

type Recipe = {
  title: string;
  time_minutes: number;
  serves: number;
  ingredients_list: string[];
  steps: string[];
  why_it_fits: string;
  variation: string;
};

export default function Home() {
  const [mood, setMood] = useState("");
  const [minutes, setMinutes] = useState(20);
  const [ingredients, setIngredients] = useState("");
  const [diet, setDiet] = useState("");
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
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
      if (!res.ok) throw new Error("Failed to generate.");
      const json = await res.json();
      setRecipe(json);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-xl p-6">
<h1 className="text-4xl font-extrabold mb-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-sm">
  🍳 MoodChef
</h1>
        <p className="text-slate-600 mb-6">Tell me your vibe, time, and what’s in the kitchen.</p>

        <form onSubmit={onSubmit} className="grid gap-4 bg-white rounded-2xl p-5 shadow">
          <input
  className="w-full rounded-xl border border-slate-300 bg-white/90 p-3 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition"
  placeholder="Mood (e.g., cozy, adventurous, lazy…)"
  required
  value={mood}
  onChange={(e) => setMood(e.target.value)}
/>


          <label className="text-sm text-slate-700">
            Time you can spare: <b>{minutes} min</b>
          </label>
          <input
            type="range"
            min={5}
            max={240}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(parseInt(e.target.value))}
          />

          <textarea
  className="w-full rounded-xl border border-slate-300 bg-white/90 p-3 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition"
  placeholder="Ingredients on hand (comma-separated)"
  rows={4}
  required
  value={ingredients}
  onChange={(e) => setIngredients(e.target.value)}
></textarea>


          <input
  className="w-full rounded-xl border border-slate-300 bg-white/90 p-3 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition"
  placeholder="Dietary prefs (optional): vegetarian, halal, gluten-free…"
  value={diet}
  onChange={(e) => setDiet(e.target.value)}
/>


          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl py-3 px-5 bg-black text-white disabled:opacity-50"
          >
            {loading ? "Cooking..." : "Get Recipe"}
          </button>
        </form>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        {recipe && (
          <section className="mt-8 bg-white rounded-2xl p-6 shadow">
            <h2 className="text-3xl font-bold mb-3 text-indigo-700 tracking-tight">
  {recipe.title}
</h2>

            <p className="text-slate-600 mb-4">
              ⏱ {recipe.time_minutes} min • 👥 Serves {recipe.serves}
            </p>
            <h3 className="text-lg font-semibold text-indigo-600 mb-2">
  Ingredients
</h3>

            <ul className="list-disc ml-6 mb-4 space-y-1 text-slate-800 marker:text-indigo-500">
  {recipe.ingredients_list.map((i, idx) => (
    <li key={idx} className="leading-relaxed">
      {i}
    </li>
  ))}
</ul>

            <h3 className="text-lg font-semibold text-indigo-600 mb-2">
  Steps
</h3>

            <ol className="list-decimal ml-6 mb-4 space-y-2 text-slate-800 marker:text-indigo-500">
  {recipe.steps.map((s, idx) => (
    <li key={idx} className="leading-relaxed">
      {s}
    </li>
  ))}
</ol>

            <p className="text-sm text-slate-700 mb-1"><b>Why it fits:</b> {recipe.why_it_fits}</p>
            <p className="text-sm text-slate-700"><b>Variation:</b> {recipe.variation}</p>
          </section>
        )}
      </div>
    </main>
  );
}
