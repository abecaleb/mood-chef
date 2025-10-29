// src/app/page.tsx (or wherever your form lives)
"use client";
import { useState } from "react";

export default function Home() {
  const [mood, setMood] = useState("");
  const [minutes, setMinutes] = useState(20);
  const [ingredients, setIngredients] = useState("");
  const [diet, setDiet] = useState("");
  const [onlyThese, setOnlyThese] = useState(false); // NEW
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRecipe(null);
    setLoading(true);
    try {
      const res = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, minutes, ingredients, diet, onlyThese }), // NEW
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setRecipe(json);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 mb-6">
          MoodChef
        </h1>

        <form onSubmit={onSubmit} className="space-y-5 bg-white/70 backdrop-blur border border-indigo-100 shadow-sm rounded-2xl p-5">
          <input
            className="border rounded-xl p-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Mood (e.g., cozy, adventurous, lazy…)"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            required
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Time (minutes)</label>
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              className="border rounded-xl p-3 w-40 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value || "0", 10))}
              required
            />
          </div>

          <textarea
            className="border rounded-xl p-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Ingredients on hand (comma-separated)"
            rows={4}
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            required
          />

          <input
            className="border rounded-xl p-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="Dietary prefs (optional): vegetarian, halal, gluten-free…"
            value={diet}
            onChange={(e) => setDiet(e.target.value)}
          />

          {/* NEW: Only-these checkbox */}
          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={onlyThese}
              onChange={(e) => setOnlyThese(e.target.checked)}
              className="mt-1 h-5 w-5 accent-indigo-600"
            />
            <span className="text-sm leading-relaxed text-slate-700">
              <span className="font-semibold">I have only these ingredients</span>{" "}
              <span className="text-slate-500">
                (apart from pantry staples like salt, pepper, oil, sugar, chilli, vinegar, soy sauce)
              </span>
            </span>
          </label>

          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-3 hover:bg-indigo-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Cooking…" : "Get Recipe"}
          </button>
        </form>

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>
        )}

        {recipe && (
          <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            {/* ... your existing rendering of recipe ... */}
          </div>
        )}
      </div>
    </main>
  );
}
