/** "Lijepe" oznake na osi (0, 500, 1000…) koje pokrivaju [min, max]. */
export function lijepeOznake(min: number, max: number, broj = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raspon = max - min;
  const grubi = raspon / broj;
  const red = Math.pow(10, Math.floor(Math.log10(grubi)));
  const korak = [1, 2, 2.5, 5, 10].map((k) => k * red).find((k) => raspon / k <= broj) ?? red * 10;
  const pocetak = Math.floor(min / korak) * korak;
  const kraj = Math.ceil(max / korak) * korak;
  const oznake: number[] = [];
  for (let v = pocetak; v <= kraj + korak / 2; v += korak) oznake.push(Math.round(v * 1000) / 1000);
  return oznake;
}

/** 1250 -> "1,3 tis.", 980 -> "980" (za oznake na osi). */
export function kompaktno(broj: number) {
  const a = Math.abs(broj);
  if (a >= 1_000_000) return `${(broj / 1_000_000).toFixed(1).replace(".", ",")} mil.`;
  if (a >= 10_000) return `${Math.round(broj / 1000)} tis.`;
  if (a >= 1000) return Math.round(broj).toLocaleString("hr-HR");
  return Number.isInteger(broj) ? String(broj) : broj.toFixed(1).replace(".", ",");
}

export const BOJE = {
  serija: "var(--color-vatra)",
  cilj: "var(--color-tekst-2)",
  mreza: "var(--color-rub)",
  tekst: "var(--color-tekst-2)",
  povrsina: "var(--color-povrsina)",
} as const;
