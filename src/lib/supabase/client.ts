import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_BAZE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const JAVNI_KLJUC = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Jesu li upisane Supabase postavke (u .env.local ili na Cloudflareu). */
export const POSTAVKE_OK = Boolean(URL_BAZE && JAVNI_KLJUC);

let klijent: SupabaseClient | null = null;

/**
 * Zahtjev ne čeka beskonačno (slab signal u teretani): 20 s za podatke,
 * 2 min za učitavanje slika.
 */
const fetchSRokom: typeof fetch = (ulaz, opcije) => {
  const url = typeof ulaz === "string" ? ulaz : ulaz instanceof URL ? ulaz.href : ulaz.url;
  const ucitavanje = url.includes("/storage/v1/object") && (opcije?.method ?? "GET").toUpperCase() !== "GET";
  const rok = AbortSignal.timeout(ucitavanje ? 120_000 : 20_000);
  const signal =
    opcije?.signal && "any" in AbortSignal ? AbortSignal.any([opcije.signal, rok]) : (opcije?.signal ?? rok);
  return fetch(ulaz, { ...opcije, signal });
};

/**
 * Supabase klijent za preglednik. Koristi samo javni ključ –
 * što tko smije vidjeti odlučuje baza (Row Level Security).
 */
export function supabase(): SupabaseClient {
  if (!POSTAVKE_OK) {
    throw new Error("Nedostaju Supabase postavke.");
  }
  if (!klijent) {
    klijent = createClient(URL_BAZE!, JAVNI_KLJUC!, { global: { fetch: fetchSRokom } });
  }
  return klijent;
}
