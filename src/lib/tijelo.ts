// Mjere tijela i izračuni (BMI, % masti, omjeri, bazalni metabolizam).

export type Spol = "m" | "z";

export type OsobniPodaci = {
  visina_cm: number | null;
  spol: Spol | null;
  godina_rodenja: number | null;
};

export const MJERE = [
  { kljuc: "tezina_kg", oznaka: "Težina", jedinica: "kg" },
  { kljuc: "vrat_cm", oznaka: "Vrat", jedinica: "cm" },
  { kljuc: "struk_cm", oznaka: "Struk", jedinica: "cm" },
  { kljuc: "bokovi_cm", oznaka: "Bokovi", jedinica: "cm" },
  { kljuc: "prsa_cm", oznaka: "Prsa", jedinica: "cm" },
  { kljuc: "ruka_cm", oznaka: "Ruka", jedinica: "cm" },
  { kljuc: "bedro_cm", oznaka: "Bedro", jedinica: "cm" },
] as const;

export type KljucMjere = (typeof MJERE)[number]["kljuc"];

export type Mjerenje = { id: string; datum: string } & Record<KljucMjere, number | null>;

export function uMjerenje(r: Record<string, unknown>): Mjerenje {
  const broj = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(r.id),
    datum: String(r.datum),
    tezina_kg: broj(r.tezina_kg),
    vrat_cm: broj(r.vrat_cm),
    struk_cm: broj(r.struk_cm),
    bokovi_cm: broj(r.bokovi_cm),
    prsa_cm: broj(r.prsa_cm),
    ruka_cm: broj(r.ruka_cm),
    bedro_cm: broj(r.bedro_cm),
  };
}

export function uOsobnePodatke(r: Record<string, unknown> | null | undefined): OsobniPodaci {
  return {
    visina_cm: r?.visina_cm == null ? null : Number(r.visina_cm),
    spol: r?.spol === "m" || r?.spol === "z" ? r.spol : null,
    godina_rodenja: r?.godina_rodenja == null ? null : Number(r.godina_rodenja),
  };
}

/** Zadnja poznata vrijednost svake mjere (mjerenja poredana od najstarijeg). */
export function zadnjeVrijednosti(mjerenja: Mjerenje[]) {
  const rez = {} as Record<KljucMjere, { vrijednost: number; datum: string } | null>;
  for (const m of MJERE) {
    let zadnja: { vrijednost: number; datum: string } | null = null;
    for (const red of mjerenja) {
      const v = red[m.kljuc];
      if (v !== null) zadnja = { vrijednost: v, datum: red.datum };
    }
    rez[m.kljuc] = zadnja;
  }
  return rez;
}

/** BMI = kg / m² */
export function izracunajBmi(kg: number | null, visinaCm: number | null) {
  if (!kg || !visinaCm) return null;
  const m = visinaCm / 100;
  return kg / (m * m);
}

export type Razina = "dobro" | "upozorenje" | "ozbiljno";

export function kategorijaBmi(bmi: number): { oznaka: string; razina: Razina } {
  if (bmi < 18.5) return { oznaka: "Pothranjenost", razina: "upozorenje" };
  if (bmi < 25) return { oznaka: "Normalna težina", razina: "dobro" };
  if (bmi < 30) return { oznaka: "Prekomjerna težina", razina: "upozorenje" };
  return { oznaka: "Pretilost", razina: "ozbiljno" };
}

/**
 * Postotak tjelesne masti – formula američke mornarice (US Navy), mjere u cm.
 * Muškarci: vrat, struk, visina. Žene: vrat, struk, bokovi, visina.
 */
export function postotakMasti(
  spol: Spol | null,
  visinaCm: number | null,
  vratCm: number | null,
  strukCm: number | null,
  bokoviCm: number | null,
) {
  if (!spol || !visinaCm || !vratCm || !strukCm) return null;
  let rez: number;
  if (spol === "m") {
    if (strukCm - vratCm <= 0) return null;
    rez = 495 / (1.0324 - 0.19077 * Math.log10(strukCm - vratCm) + 0.15456 * Math.log10(visinaCm)) - 450;
  } else {
    if (!bokoviCm || strukCm + bokoviCm - vratCm <= 0) return null;
    rez =
      495 / (1.29579 - 0.35004 * Math.log10(strukCm + bokoviCm - vratCm) + 0.221 * Math.log10(visinaCm)) - 450;
  }
  return Number.isFinite(rez) && rez > 2 && rez < 70 ? rez : null;
}

export function kategorijaMasti(spol: Spol, posto: number): { oznaka: string; razina: Razina } {
  // Približne granice (American Council on Exercise)
  const [sport, fit, prosjek] = spol === "m" ? [14, 18, 25] : [21, 25, 32];
  if (posto < sport) return { oznaka: "Sportska razina", razina: "dobro" };
  if (posto < fit) return { oznaka: "Dobra forma", razina: "dobro" };
  if (posto < prosjek) return { oznaka: "Prosjek", razina: "upozorenje" };
  return { oznaka: "Povišeno", razina: "ozbiljno" };
}

/** Omjer struka i visine; iznad 0,5 povećan rizik. */
export function omjerStrukVisina(strukCm: number | null, visinaCm: number | null) {
  return strukCm && visinaCm ? strukCm / visinaCm : null;
}

/** Omjer struka i bokova; rizik iznad 0,90 (m) / 0,85 (ž). */
export function omjerStrukBokovi(strukCm: number | null, bokoviCm: number | null) {
  return strukCm && bokoviCm ? strukCm / bokoviCm : null;
}

export function dob(godinaRodenja: number | null, danas: string) {
  return godinaRodenja ? Number(danas.slice(0, 4)) - godinaRodenja : null;
}

/** Bazalni metabolizam (Mifflin-St Jeor), kcal/dan. */
export function bazalniMetabolizam(spol: Spol | null, kg: number | null, visinaCm: number | null, godine: number | null) {
  if (!spol || !kg || !visinaCm || !godine) return null;
  return 10 * kg + 6.25 * visinaCm - 5 * godine + (spol === "m" ? 5 : -161);
}

/** 82.5 -> "82,5"; jedno decimalno mjesto, bez nepotrebne nule. */
export function format1(broj: number) {
  const z = Math.round(broj * 10) / 10;
  return Number.isInteger(z) ? String(z) : z.toFixed(1).replace(".", ",");
}

export function format2(broj: number) {
  return broj.toFixed(2).replace(".", ",");
}
