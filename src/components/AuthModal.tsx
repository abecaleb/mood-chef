"use client";
import { supabase } from "@/lib/supabaseClient";
import { useState } from "react";

export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  if (!open) return null;

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    // Magic link (no password)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (!error) onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-xl font-semibold mb-4">Sign in to save recipes</h3>

        <button
          onClick={signInWithGoogle}
          className="w-full rounded-xl border border-slate-300 py-2.5 mb-3 hover:bg-slate-50"
        >
          Continue with Google
        </button>

        {/* Add more providers later (Facebook, etc.) */}

        <div className="my-3 text-center text-slate-400 text-sm">or</div>

        <form onSubmit={signInWithEmail} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-amber-500 text-white py-2.5 hover:bg-amber-600"
          >
            Send magic link
          </button>
        </form>

        <button onClick={onClose} className="mt-4 w-full text-slate-500 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
