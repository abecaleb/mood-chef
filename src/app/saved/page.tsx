"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { saveFavorite } from "@/lib/favorites";
import AuthModal from "@/components/AuthModal";

export default function SavedPage() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchSaved() {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) {
        router.push("/"); // redirect if not logged in
        return;
      }
      const { data, error } = await supabase
        .from("favorites")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) console.error(error);
      else setRecipes(data || []);
      setLoading(false);
    }
    fetchSaved();
  }, [router]);

  if (loading)
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-600">
        Loading your saved recipes…
      </main>
    );

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-white">
      {/* HEADER */}
      <header className="max-w-4xl mx-auto px-5 pt-12 pb-8 text-center">
        <div className="flex items-center justify-between mb-4">
          {/* Left: logo */}
          <div className="inline-flex items-center gap-3">
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

          {/* Right: Back button */}
          <a
            href="/"
            className="text-sm font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl px-4 py-2 border border-amber-100 transition"
          >
            ← Back
          </a>
        </div>

        <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed">
          💖 Your saved recipes — all in one place.
        </p>
      </header>

      {/* RESULTS */}
      <section className="max-w-4xl mx-auto px-5 pb-16">
        {recipes.length === 0 ? (
          <p className="text-center text-slate-600 mt-10">
            You haven’t saved any recipes yet. Go explore some tasty ideas first!
          </p>
        ) : (
          <div className="space-y-6">
            {recipes.map((fav) => (
              <ResultCard key={fav.id} recipe={fav.data} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/* ---------------- Reuse ResultCard from main page ---------------- */

function ResultCard({ recipe }: { recipe: any }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-bold text-slate-900 line-clamp-1">{recipe.title}</h3>
        <div className="flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
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
