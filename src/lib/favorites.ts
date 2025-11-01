import { supabase } from "@/lib/supabaseClient";

/**
 * Returns the currently logged-in user (or null if none)
 */
export async function getSessionUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("getSessionUser error:", error);
    return null;
  }
  return data.user || null;
}

/**
 * Saves a recipe to the user's favorites.
 * Returns { ok: true } if saved, or { needsAuth: true } if user not signed in.
 */
export async function saveFavorite(recipe: any) {
  const user = await getSessionUser();
  if (!user) return { needsAuth: true };

  const payload = {
    user_id: user.id,
    title: recipe.title,
    data: recipe, // store full JSON recipe
  };

  const { error } = await supabase.from("favorites").insert(payload);
  if (error) {
    console.error("saveFavorite error:", error);
    throw error;
  }

  return { ok: true };
}
