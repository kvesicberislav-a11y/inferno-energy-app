import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase klijent s TAJNIM ključem. Smije se koristiti samo na poslužitelju
 * (API rute), nikad u pregledniku. Zaobilazi zaštitu baze, pa svaka ruta
 * koja ga koristi mora sama provjeriti tko šalje zahtjev.
 */
export function adminKlijent() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const tajniKljuc = process.env.SUPABASE_SECRET_KEY;
  if (!url || !tajniKljuc) {
    throw new Error("Poslužitelj nema Supabase postavke.");
  }
  return createClient(url, tajniKljuc, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
