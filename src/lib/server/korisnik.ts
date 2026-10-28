import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Uloga } from "@/lib/tipovi";

export type PrijavljeniKorisnik = { id: string; uloga: Uloga; ime: string };

/**
 * Provjerava da zahtjev šalje prijavljeni, aktivni korisnik (trener ili klijent).
 * Vraća njegov id, ulogu i ime ili poruku greške sa statusom.
 */
export async function provjeriKorisnika(
  request: Request,
  admin: SupabaseClient,
): Promise<PrijavljeniKorisnik | { greska: string; status: number }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { greska: "Nisi prijavljen.", status: 401 };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { greska: "Nisi prijavljen.", status: 401 };
  const { data: profil } = await admin
    .from("profili")
    .select("uloga, aktivan, ime")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profil || !profil.aktivan || (profil.uloga !== "trener" && profil.uloga !== "klijent")) {
    return { greska: "Nemaš ovlasti za ovo.", status: 403 };
  }
  return { id: data.user.id, uloga: profil.uloga as Uloga, ime: String(profil.ime ?? "") };
}
