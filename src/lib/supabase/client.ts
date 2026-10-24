import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_BAZE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const JAVNI_KLJUC = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Jesu li upisane Supabase postavke (u .env.local ili na Cloudflareu). */
export const POSTAVKE_OK = Boolean(URL_BAZE && JAVNI_KLJUC);

let klijent: SupabaseClient | null = null;

/**
 * Supabase klijent za preglednik. Koristi samo javni ključ –
 * što tko smije vidjeti odlučuje baza (Row Level Security).
 */
export function supabase(): SupabaseClient {
  if (!POSTAVKE_OK) {
    throw new Error("Nedostaju Supabase postavke.");
  }
  if (!klijent) {
    klijent = createClient(URL_BAZE!, JAVNI_KLJUC!);
  }
  return klijent;
}
