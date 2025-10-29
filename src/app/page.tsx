"use client";

import { useState } from "react";
import Image from "next/image";

type Mood =
  | "Comfort Food"
  | "Healthy & Fresh"
  | "Adventurous"
  | "Quick & Easy"
  | "Indulgent"
  | "Light & Simple";

const MOODS: { label: Mood; icon: string }[] = [
  { label: "Comfort Food", icon: "🍲" },
  { label: "Healthy & Fresh", icon: "🥗" },
  { label: "Adventurous", icon: "🌶️" },
  { label: "Quick & Easy", icon: "⚡️" },
  { label: "Indulgent", icon: "🍰" },
  { label: "Light & Simple", icon: "🌱" },
];

// Visual only (not sent to backend yet)
const CUISINES = [
  { label: "Italian", flag: "🇮🇹" },
  { label: "Mexican", flag: "🇲🇽" },
  { label: "Chinese", flag: "🇨🇳" },
  { label: "Indian", flag: "🇮🇳" },
  { label: "American", flag: "🇺🇸" },
  { label: "French", flag: "🇫🇷" },
  { label: "Thai", flag: "🇹🇭" },
  { label: "Japanese", flag: "🇯🇵" },
  { label: "Greek", flag: "🇬🇷" },
];

export default function Home() {
  const [ingredients, setIngredients] = useState("");
  const [mood, setMood] = useState<Mood | "">("");
  const [diet, setDiet] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [onlyThese, setOnlyThese] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<any>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRecipe(null);
    setLoading(true);
    try {
      const res = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients,
          mood: mood || "Comfort Food",
          diet: diet || undefined,
          minutes,
          onlyThese,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      setRecipe(json);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-white">
      {/* HERO */}
      <header className="max-w-4xl mx-auto px-5 pt-12 pb-8 text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <Image
            src="/moodchef-logo.svg"
            alt="MoodChef logo"
            width={44}
            height={44}
            className="rounded-xl ring-1 ring-black/5"
            priority
          />
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-orange-500">
            MoodChef
          </h1>
        </div>
        <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed">
          What’s for dinner, made easy. Tell us your{" "}
          <span className="font-medium text-slate-700">ingredients</span>,{" "}
          <span className="font-medium text-slate-700">mood</span>, and{" "}
          <span className="font-medium text-slate-700">time</span> — we’ll find a recipe that fits your vibe.
        </p>
      </header>

      {/* FORM CARD */}
      <section className="max-w-4xl mx-auto px-5 pb-16">
        <form
          onSubmit={onSubmit}
          className="bg-white/80 backdrop-blur border border-slate-200 rounded-3xl shadow-sm p-5 sm:p-8"
        >
          {/* INGREDIENTS */}
          <FieldHeader icon="🍴" title="What ingredients do you have?" />
          <input
            className="w-full mt-2 mb-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-800 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-4 focus:ring-amber-200"
            placeholder="e.g., potatoes, pumpkin, spinach"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            required
          />
          <p className="text-xs text-slate-500 mb-4">
            Separate with commas. We’ll match and score recipes.
          </p>

          {/* MOOD */}
          <FieldHeader icon="✨" title="What’s your mood?" className="mt-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {MOODS.map((m) => (
              <Chip
                key={m.label}
                selected={mood === m.label}
                onClick={() => setMood(m.label)}
                label={
                  <span className="inline-flex items-center gap-2">
                    <span className="text-lg">{m.icon}</span>
                    {m.label}
                  </span>
                }
              />
            ))}
          </div>

          {/* DIET + ONLY-THESE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Dietary prefs (optional)
              </label>
              <input
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm focus:outline-none focus:ring-4 focus:ring-amber-200"
                placeholder="vegetarian, halal, gluten-free…"
                value={diet}
                onChange={(e) => setDiet(e.target.value)}
              />
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyThese}
                onChange={(e) => setOnlyThese(e.target.checked)}
                className="mt-1 h-5 w-5 accent-amber-500"
              />
              <span className="text-sm text-slate-700 leading-relaxed">
                <span className="font-semibold">I have only these ingredients</span>{" "}
                <span className="text-slate-500">
                  (apart from pantry staples like salt, oil, pepper, sugar, chilli)
                </span>
              </span>
            </label>
          </div>

          {/* CUISINES (visual only) */}
          <FieldHeader icon="🌐" title="Filter by cuisine (optional)" className="mt-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
            {CUISINES.map((c) => (
              <Chip key={c.label} selected={false} label={`${c.flag} ${c.label}`} muted />
            ))}
          </div>

          {/* TIME SLIDER */}
          <FieldHeader icon="⏱️" title={`Maximum cooking time (${minutes} minutes)`} className="mt-6" />
          <input
            type="range"
            min={10}
            max={120}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(parseInt(e.target.value, 10))}
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>10 min</span>
            <span>120 min</span>
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className="mt-7 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold py-3.5 shadow-md hover:from-amber-600 hover:to-orange-600 focus:outline-none focus:ring-4 focus:ring-amber-200 transition-all disabled:opacity-60"
          >
            {loading ? "Finding something tasty…" : "Find My Recipe 🍳"}
          </button>

          {/* ERRORS / RESULT */}
          {error && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}

          {recipe && <ResultCard recipe={recipe} />}
        </form>
      </section>
    </main>
  );
}

/* ---------------- Components ---------------- */

function FieldHeader({
  icon,
  title,
  className = "",
}: {
  icon: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-lg">{icon}</span>
      <h2 className="text-slate-800 font-semibold">{title}</h2>
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
  muted = false,
}: {
  label: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-2xl px-4 py-3 text-left border transition-colors",
        selected
          ? "bg-amber-500 text-white border-amber-500"
          : muted
          ? "bg-white text-slate-700 border-slate-300 hover:border-amber-300"
          : "bg-white text-slate-800 border-slate-300 hover:border-amber-300",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ResultCard({ recipe }: { recipe: any }) {
  return (
    <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-2xl font-bold text-slate-900">{recipe.title}</h3>
        <div className="text-sm text-slate-600 whitespace-nowrap">
          ⏱ {recipe.time_minutes} min • 👥 Serves {recipe.serves}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h4 className="font-semibold text-slate-800 mb-2">Ingredients</h4>
          <ul className="list-disc pl-5 space-y-1 text-slate-700">
            {recipe.ingredients_list?.map((i: string, idx: number) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="font-semibold text-slate-800 mb-2">Steps</h4>
          <ol className="list-decimal pl-5 space-y-1 text-slate-700">
            {recipe.steps?.map((s: string, idx: number) => (
              <li key={idx}>{s}</li>
            ))}
          </ol>
        </section>
      </div>

      {recipe.why_it_fits && (
        <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-900">
          <span className="font-semibold">Why it fits: </span>
          {recipe.why_it_fits}
        </div>
      )}

      {recipe.variation && (
        <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-slate-800">
          <span className="font-semibold">Variation: </span>
          {recipe.variation}
        </div>
      )}
    </div>
  );
}
