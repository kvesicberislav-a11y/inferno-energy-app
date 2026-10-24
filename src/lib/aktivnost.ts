import { brojDana, danasZagreb, datumZagreb } from "@/lib/datum";

/** Nakon koliko dana bez ikakvog unosa trener dobiva upozorenje. */
export const DANA_DO_UPOZORENJA = 3;

/** "1 dan", "2 dana", "21 dan", "11 dana" */
export function dana(n: number) {
  return n % 10 === 1 && n % 100 !== 11 ? `${n} dan` : `${n} dana`;
}

export type Aktivnost = {
  /** dana od zadnjeg unosa (ili od registracije ako unosa nikad nije bilo) */
  danaBez: number;
  nikad: boolean;
  upozorenje: boolean;
  opis: string;
};

export function aktivnost(zadnja: string | null, registriran: string): Aktivnost {
  const danas = danasZagreb();
  const od = datumZagreb(zadnja ?? registriran);
  const danaBez = Math.max(0, brojDana(od, danas) - 1);
  const nikad = zadnja === null;
  let opis: string;
  if (nikad) opis = danaBez === 0 ? "Još ništa nije unio (registriran danas)" : `Još ništa nije unio (${dana(danaBez)})`;
  else if (danaBez === 0) opis = "Aktivan danas";
  else if (danaBez === 1) opis = "Zadnji unos jučer";
  else opis = `Bez unosa ${dana(danaBez)}`;
  return { danaBez, nikad, upozorenje: danaBez >= DANA_DO_UPOZORENJA, opis };
}
