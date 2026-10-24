import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Provjerava da zahtjev šalje prijavljeni, aktivni trener.
 * Vraća id trenera ili poruku greške sa statusom.
 */
export async function provjeriTrenera(
  request: Request,
  admin: SupabaseClient,
): Promise<{ trenerId: string } | { greska: string; status: number }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { greska: "Nisi prijavljen.", status: 401 };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { greska: "Nisi prijavljen.", status: 401 };
  const { data: profil } = await admin
    .from("profili")
    .select("uloga, aktivan")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profil || profil.uloga !== "trener" || !profil.aktivan) {
    return { greska: "Nemaš ovlasti za ovo.", status: 403 };
  }
  return { trenerId: data.user.id };
}
