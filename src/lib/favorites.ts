// src/lib/favorites.ts
import { supabase } from "@/lib/supabaseClient";

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

export async function saveFavorite(recipe: any) {
  const user = await getSessionUser();
  if (!user) return { needsAuth: true };

  const payload = {
    user_id: user.id,
    title: recipe.title,
    data: recipe, // full JSON
  };

  const { error } = await supabase.from("favorites").insert(payload);
  if (error) throw error;
  return { ok: true };
}
