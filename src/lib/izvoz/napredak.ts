// Napredak po vježbi za izvještaj: najteža serija na svakom treningu i sažetak po mjesecima.
import type { TreningIzvoza } from "./podaci";

export type DanVjezbe = { datum: string; kg: number; ponavljanja: number; serija: number; volumen: number };
export type MjesecVjezbe = { mjesec: string; najteza: DanVjezbe; prosjekKg: number | null; treninga: number };
export type NapredakVjezbe = {
  vjezba: string;
  /** false = vježba bez utega (prati se po ponavljanjima) */
  poKg: boolean;
  dani: DanVjezbe[];
  mjeseci: MjesecVjezbe[];
  prvi: DanVjezbe;
  zadnji: DanVjezbe;
  najbolji: DanVjezbe;
};

const MJESECI = ["siječanj", "veljača", "ožujak", "travanj", "svibanj", "lipanj", "srpanj", "kolovoz", "rujan", "listopad", "studeni", "prosinac"];

/** "2026-02" -> "veljača 2026." */
export function nazivMjeseca(mjesec: string) {
  const [g, m] = mjesec.split("-").map(Number);
  return `${MJESECI[m - 1]} ${g}.`;
}

const bolji = (a: DanVjezbe, b: DanVjezbe) => (b.kg > a.kg || (b.kg === a.kg && b.ponavljanja > a.ponavljanja) ? b : a);

/** Sve vježbe iz treninga, najčešće prve. */
export function napredakPoVjezbama(treninzi: TreningIzvoza[]): NapredakVjezbe[] {
  const po = new Map<string, Map<string, DanVjezbe>>();
  for (const t of treninzi) {
    for (const s of t.serije) {
      const dani = po.get(s.vjezba) ?? new Map<string, DanVjezbe>();
      const d = dani.get(t.datum);
      const ova = { datum: t.datum, kg: s.kg, ponavljanja: s.ponavljanja, serija: 1, volumen: s.kg * s.ponavljanja };
      dani.set(
        t.datum,
        d ? { ...bolji(d, ova), datum: t.datum, serija: d.serija + 1, volumen: d.volumen + ova.volumen } : ova,
      );
      po.set(s.vjezba, dani);
    }
  }

  return [...po.entries()]
    .map(([vjezba, mapa]) => {
      const dani = [...mapa.values()].sort((a, b) => a.datum.localeCompare(b.datum));
      const poKg = dani.some((d) => d.kg > 0);
      const mjeseci = new Map<string, DanVjezbe[]>();
      for (const d of dani) mjeseci.set(d.datum.slice(0, 7), [...(mjeseci.get(d.datum.slice(0, 7)) ?? []), d]);
      const sKg = (x: DanVjezbe[]) => x.filter((d) => d.kg > 0);
      const relevantni = poKg ? sKg(dani) : dani;
      return {
        vjezba,
        poKg,
        dani,
        mjeseci: [...mjeseci.entries()].map(([mjesec, dd]) => ({
          mjesec,
          najteza: dd.reduce(bolji),
          prosjekKg: sKg(dd).length ? sKg(dd).reduce((s, d) => s + d.kg, 0) / sKg(dd).length : null,
          treninga: dd.length,
        })),
        prvi: relevantni[0] ?? dani[0],
        zadnji: relevantni[relevantni.length - 1] ?? dani[dani.length - 1],
        najbolji: dani.reduce(bolji),
      };
    })
    .sort((a, b) => b.dani.length - a.dani.length || a.vjezba.localeCompare(b.vjezba, "hr"));
}
