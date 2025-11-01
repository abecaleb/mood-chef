"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    // Supabase automatically sets the session after redirect
    const t = setTimeout(() => router.replace("/"), 600);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-slate-600">Signing you in…</p>
    </main>
  );
}
