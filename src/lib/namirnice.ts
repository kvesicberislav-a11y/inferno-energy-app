// Namirnice za skeniranje barkoda: naša baza -> Open Food Facts -> ručni unos.
import { kcalIz, type Makroi } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";

export type Namirnica = {
  id: string;
  barkod: string | null;
  naziv: string;
  marka: string;
  proteini_100: number;
  ugljikohidrati_100: number;
  masti_100: number;
  porcija_g: number | null;
  izvor: "off" | "korisnik";
  dodao: string | null;
};

export function uNamirnicu(r: Record<string, unknown>): Namirnica {
  return {
    id: String(r.id),
    barkod: r.barkod ? String(r.barkod) : null,
    naziv: String(r.naziv ?? ""),
    marka: String(r.marka ?? ""),
    proteini_100: Number(r.proteini_100),
    ugljikohidrati_100: Number(r.ugljikohidrati_100),
    masti_100: Number(r.masti_100),
    porcija_g: r.porcija_g == null ? null : Number(r.porcija_g),
    izvor: r.izvor === "off" ? "off" : "korisnik",
    dodao: r.dodao ? String(r.dodao) : null,
  };
}

const zaokruzi = (n: number) => Math.round(n * 10) / 10;

/** Makroi za zadanu količinu u gramima. */
export function makroiZaGrame(n: Namirnica, grami: number): Makroi & { kcal: number } {
  const f = grami / 100;
  const m = {
    proteini: zaokruzi(n.proteini_100 * f),
    ugljikohidrati: zaokruzi(n.ugljikohidrati_100 * f),
    masti: zaokruzi(n.masti_100 * f),
  };
  return { ...m, kcal: kcalIz(m) };
}

export function kcalNa100(n: Pick<Namirnica, "proteini_100" | "ugljikohidrati_100" | "masti_100">) {
  return kcalIz({ proteini: n.proteini_100, ugljikohidrati: n.ugljikohidrati_100, masti: n.masti_100 });
}

/** Barkod: samo znamenke, 6–14 (EAN-8, EAN-13, UPC…) */
export function ispravanBarkod(kod: string) {
  return /^[0-9]{6,14}$/.test(kod);
}

const ogranici = (v: unknown) => {
  const b = Number(v);
  return Number.isFinite(b) ? Math.min(100, Math.max(0, zaokruzi(b))) : null;
};

type OffOdgovor = {
  status?: number;
  product?: {
    product_name?: string;
    product_name_hr?: string;
    generic_name?: string;
    brands?: string;
    serving_quantity?: number | string;
    nutriments?: Record<string, unknown>;
  };
};

/** Traži proizvod u Open Food Facts (besplatna otvorena baza). Vraća null ako nema makroa. */
async function trazenjeOff(barkod: string) {
  const kontrola = new AbortController();
  const odbrojavanje = setTimeout(() => kontrola.abort(), 9000);
  try {
    const odgovor = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barkod}?fields=product_name,product_name_hr,generic_name,brands,serving_quantity,nutriments`,
      { signal: kontrola.signal },
    );
    if (!odgovor.ok) return null;
    const json = (await odgovor.json()) as OffOdgovor;
    const p = json.product;
    if (json.status !== 1 || !p?.nutriments) return null;
    const proteini = ogranici(p.nutriments.proteins_100g);
    const uh = ogranici(p.nutriments.carbohydrates_100g);
    const masti = ogranici(p.nutriments.fat_100g);
    if (proteini === null || uh === null || masti === null) return null;
    const porcija = Number(p.serving_quantity);
    return {
      naziv: (p.product_name_hr || p.product_name || p.generic_name || "Proizvod").trim().slice(0, 120),
      marka: (p.brands ?? "").split(",")[0].trim().slice(0, 80),
      proteini_100: proteini,
      ugljikohidrati_100: uh,
      masti_100: masti,
      porcija_g: Number.isFinite(porcija) && porcija >= 1 && porcija <= 2000 ? zaokruzi(porcija) : null,
    };
  } catch {
    return null; // nema veze ili Open Food Facts ne radi – prelazi se na ručni unos
  } finally {
    clearTimeout(odbrojavanje);
  }
}

/**
 * Pronađi namirnicu po barkodu: prvo u našoj bazi, zatim u Open Food Facts
 * (pronađeno se sprema u našu bazu da sljedeći put bude odmah tu).
 */
export async function pronadiPoBarkodu(barkod: string): Promise<Namirnica | null> {
  const sb = supabase();
  const nasa = await sb.from("namirnice").select("*").eq("barkod", barkod).maybeSingle();
  if (nasa.data) return uNamirnicu(nasa.data);

  const off = await trazenjeOff(barkod);
  if (!off) return null;

  const { data } = await sb
    .from("namirnice")
    .insert({ ...off, barkod, izvor: "off" })
    .select()
    .single();
  if (data) return uNamirnicu(data);
  // netko ga je upravo spremio – pročitaj ponovno
  const ponovo = await sb.from("namirnice").select("*").eq("barkod", barkod).maybeSingle();
  return ponovo.data ? uNamirnicu(ponovo.data) : null;
}
