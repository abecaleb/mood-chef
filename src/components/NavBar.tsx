// src/components/NavBar.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function NavBar() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [favCount, setFavCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const u = data.user ?? null;
      setUserEmail(u?.email ?? null);

      if (u) {
        const { count } = await supabase
          .from("favorites")
          .select("*", { count: "exact", head: true })
          .eq("user_id", u.id);
        setFavCount(count ?? 0);
      } else {
        setFavCount(0);
      }
    }
    load();

    // update on auth changes
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());

    // listen for save events to bump the badge instantly
    const onFavSaved = () => setFavCount((c) => c + 1);
    if (typeof window !== "undefined") {
      window.addEventListener("favorite:saved", onFavSaved);
    }

    return () => {
      sub.subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("favorite:saved", onFavSaved);
      }
    };
  }, []);

  const signIn = async () => {
    setLoading(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback`
              : undefined,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/moodchef-logo.svg"
            width={28}
            height={28}
            alt="MoodChef"
            className="rounded-md ring-1 ring-black/5"
            priority
          />
          <span className="text-lg font-bold tracking-tight text-slate-900">
            MoodChef
          </span>
        </Link>

        <nav className="flex items-center gap-3">
          {/* Only show Saved when signed in */}
          {userEmail && (
            <Link
              href="/saved"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:border-amber-300"
              title="View saved recipes"
            >
              <span>Saved</span>
              <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                {favCount}
              </span>
            </Link>
          )}

          {userEmail ? (
            <button
              onClick={signOut}
              disabled={loading}
              className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              title={`Signed in as ${userEmail}`}
            >
              Sign out
            </button>
          ) : (
            <button
              onClick={signIn}
              disabled={loading}
              className="inline-flex items-center rounded-xl bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {loading ? "…" : "Sign in"}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
