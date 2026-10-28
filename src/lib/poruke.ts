import { danasZagreb, datumZagreb, dodajDane, opisDana, vrijemeZagreb } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import type { Uloga } from "@/lib/tipovi";

export type Poruka = {
  id: string;
  klijentId: string;
  odTrenera: boolean;
  tekst: string;
  procitano: string | null;
  kreirano: string;
};

/** Kome trener šalje: jednom klijentu (id) ili skupini. */
export type Skupina = "svi" | "uzivo" | "online";

/** Kad netko pročita poruke, javi izborniku da osvježi broj nepročitanih. */
export const DOGADAJ_PROCITANO = "inferno-poruke-procitane";

export function uPoruku(r: Record<string, unknown>): Poruka {
  return {
    id: String(r.id),
    klijentId: String(r.klijent_id),
    odTrenera: Boolean(r.od_trenera),
    tekst: String(r.tekst ?? ""),
    procitano: r.procitano ? String(r.procitano) : null,
    kreirano: String(r.kreirano),
  };
}

export async function dohvatiPoruke(klijentId: string): Promise<{ poruke: Poruka[]; greska: string | null }> {
  const { data, error } = await supabase()
    .from("poruke")
    .select("id, klijent_id, od_trenera, tekst, procitano, kreirano")
    .eq("klijent_id", klijentId)
    .order("kreirano", { ascending: false })
    .limit(200);
  return {
    poruke: ((data as Record<string, unknown>[] | null) ?? []).map(uPoruku).reverse(),
    greska: error ? prevediGresku(error.message) : null,
  };
}

export async function oznaciProcitano(klijentId: string) {
  const { error } = await supabase().rpc("oznaci_procitano", { p_klijent: klijentId });
  if (!error) window.dispatchEvent(new Event(DOGADAJ_PROCITANO));
}

/** Broj nepročitanih poruka: klijentu od trenera, treneru od svih klijenata. */
export async function brojNeprocitanih(uloga: Uloga): Promise<number> {
  const { count } = await supabase()
    .from("poruke")
    .select("id", { count: "exact", head: true })
    .is("procitano", null)
    .eq("od_trenera", uloga === "klijent");
  return count ?? 0;
}

async function zaglavlja() {
  const { data } = await supabase().auth.getSession();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
  };
}

/**
 * Šalje poruku preko poslužitelja (on šalje i obavijest na mobitel).
 * `za`: klijent ne zadaje ništa (ide treneru); trener zadaje id klijenta ili skupinu.
 */
export async function posaljiPoruku(
  tekst: string,
  za?: string,
): Promise<{ poruke: Poruka[]; broj: number } | { greska: string }> {
  try {
    const odgovor = await fetch("/api/poruke", {
      method: "POST",
      headers: await zaglavlja(),
      body: JSON.stringify({ tekst, za }),
    });
    const r = (await odgovor.json().catch(() => ({}))) as {
      poruke?: Record<string, unknown>[];
      broj?: number;
      preostale?: string[];
      greska?: string;
    };
    if (!odgovor.ok) return { greska: r.greska ?? "Poruka nije poslana. Pokušaj ponovno." };
    if (r.preostale?.length) void obavijestiOstale(r.preostale);
    return { poruke: (r.poruke ?? []).map(uPoruku), broj: r.broj ?? 0 };
  } catch {
    return { greska: "Nema veze s poslužiteljem. Provjeri internet." };
  }
}

/** Obavijesti za veliku skupinu šalju se u dijelovima od 10 (ograničenje besplatnog plana). */
async function obavijestiOstale(ids: string[]) {
  for (let i = 0; i < ids.length; i += 10) {
    try {
      await fetch("/api/obavijesti", {
        method: "POST",
        headers: await zaglavlja(),
        body: JSON.stringify({ ids: ids.slice(i, i + 10) }),
      });
    } catch {
      // poruke su spremljene; propuštena obavijest nije kritična
    }
  }
}

/** "Danas", "Jučer" ili "Utorak, 27. 10." */
export function opisDanaPoruke(iso: string) {
  const dan = datumZagreb(iso);
  const danas = danasZagreb();
  if (dan === danas) return "Danas";
  if (dan === dodajDane(danas, -1)) return "Jučer";
  return opisDana(dan);
}

/** Kratko vrijeme za popis razgovora: "14:05", "Jučer" ili "27. 10." */
export function kratkoVrijeme(iso: string) {
  const dan = datumZagreb(iso);
  const danas = danasZagreb();
  if (dan === danas) return vrijemeZagreb(iso);
  if (dan === dodajDane(danas, -1)) return "Jučer";
  return `${Number(dan.slice(8, 10))}. ${Number(dan.slice(5, 7))}.`;
}
