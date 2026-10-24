export type Makroi = {
  proteini: number;
  ugljikohidrati: number;
  masti: number;
};

export type Obrok = Makroi & {
  id: string;
  klijent_id: string;
  datum: string;
  naziv: string;
  kcal: number;
  kreirano: string;
};

export type Cilj = Makroi & {
  id: string;
  klijent_id: string;
  vrijedi_od: string;
  kcal: number;
};

export type Zbroj = Makroi & { kcal: number };

/** Kalorije iz makroa: proteini 4, ugljikohidrati 4, masti 9 kcal po gramu. */
export function kcalIz(m: Makroi) {
  return m.proteini * 4 + m.ugljikohidrati * 4 + m.masti * 9;
}

export function zbroj(obroci: Obrok[]): Zbroj {
  const z = obroci.reduce(
    (acc, o) => ({
      proteini: acc.proteini + o.proteini,
      ugljikohidrati: acc.ugljikohidrati + o.ugljikohidrati,
      masti: acc.masti + o.masti,
    }),
    { proteini: 0, ugljikohidrati: 0, masti: 0 },
  );
  return { ...z, kcal: kcalIz(z) };
}

/** Cilj koji vrijedi za zadani dan (ciljevi moraju biti od najnovijeg prema starijem). */
export function ciljZaDan(ciljevi: Cilj[], dan: string): Cilj | null {
  return ciljevi.find((c) => c.vrijedi_od <= dan) ?? null;
}

/** Brojevi iz baze ponekad stižu kao tekst – pretvori ih u brojeve. */
export function uObrok(red: Record<string, unknown>): Obrok {
  return {
    id: String(red.id),
    klijent_id: String(red.klijent_id),
    datum: String(red.datum),
    naziv: String(red.naziv),
    kreirano: String(red.kreirano),
    proteini: Number(red.proteini),
    ugljikohidrati: Number(red.ugljikohidrati),
    masti: Number(red.masti),
    kcal: Number(red.kcal),
  };
}

export function uCilj(red: Record<string, unknown>): Cilj {
  return {
    id: String(red.id),
    klijent_id: String(red.klijent_id),
    vrijedi_od: String(red.vrijedi_od),
    kcal: Number(red.kcal),
    proteini: Number(red.proteini),
    ugljikohidrati: Number(red.ugljikohidrati),
    masti: Number(red.masti),
  };
}

/**
 * "12,5" ili "12.5" -> 12.5; prazno -> 0; neispravno -> null.
 * Hrvatska tipkovnica daje zarez, zato prihvaćamo oboje.
 */
export function parsirajBroj(tekst: string): number | null {
  const t = tekst.trim().replace(",", ".");
  if (t === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const broj = Number(t);
  return Number.isFinite(broj) ? Math.round(broj * 10) / 10 : null;
}

/** 12 -> "12", 12.5 -> "12,5" */
export function formatG(broj: number) {
  const zaokruzeno = Math.round(broj * 10) / 10;
  return Number.isInteger(zaokruzeno)
    ? String(zaokruzeno)
    : zaokruzeno.toFixed(1).replace(".", ",");
}

/** Zaokruženo na cijeli broj, s točkom za tisućice: 2150 -> "2.150" */
export function formatKcal(broj: number) {
  return Math.round(broj).toLocaleString("hr-HR");
}

export const PRIJEDLOZI_OBROKA = ["Doručak", "Užina", "Ručak", "Večera"] as const;

/** Prijedlog naziva obroka prema dobu dana. */
export function obrokPremaSatu(sat: number) {
  if (sat < 10) return "Doručak";
  if (sat < 12) return "Užina";
  if (sat < 16) return "Ručak";
  if (sat < 18) return "Užina";
  return "Večera";
}
