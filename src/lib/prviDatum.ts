import { datumZagreb } from "@/lib/datum";
import { supabase } from "@/lib/supabase/client";

/**
 * Prvi dan s podacima klijenta: registracija ili raniji unos (npr. povijest treninga unesena iz tablice).
 * Izvoz i grafovi „cijelo vrijeme” kreću od ovog dana, ne od registracije.
 */
export async function prviDatumKlijenta(klijentId: string, kreirano: string): Promise<string> {
  const sb = supabase();
  const prvi = (tablica: "treninzi" | "obroci" | "mjerenja") =>
    sb.from(tablica).select("datum").eq("klijent_id", klijentId).order("datum").limit(1).maybeSingle();
  const rez = await Promise.all([prvi("treninzi"), prvi("obroci"), prvi("mjerenja")]);
  const datumi = rez.flatMap((r) => (r.data?.datum ? [String(r.data.datum)] : []));
  return [datumZagreb(kreirano), ...datumi].sort()[0];
}
