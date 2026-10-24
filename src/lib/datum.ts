const ZONA = "Europe/Zagreb";

const formatDatuma = new Intl.DateTimeFormat("hr-HR", {
  timeZone: ZONA,
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

/** "2026-10-24T10:00:00Z" -> "24. 10. 2026." (po zagrebačkom vremenu) */
export function formatDatum(iso: string) {
  return formatDatuma.format(new Date(iso));
}

// ---------------------------------------------------------------------
// Kalendarski dani kao tekst "YYYY-MM-DD" (bez vremena i bez zona)
// ---------------------------------------------------------------------

const formatISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Današnji datum u Zagrebu, npr. "2026-10-24". */
export function danasZagreb(): string {
  return formatISO.format(new Date());
}

/** Kalendarski dan (po Zagrebu) za neki trenutak, npr. vrijeme registracije. */
export function datumZagreb(iso: string): string {
  return formatISO.format(new Date(iso));
}

/** Broj dana od `od` do `doDana` (uključivo oba). */
export function brojDana(od: string, doDana: string): number {
  const a = Date.UTC(+od.slice(0, 4), +od.slice(5, 7) - 1, +od.slice(8, 10));
  const b = Date.UTC(+doDana.slice(0, 4), +doDana.slice(5, 7) - 1, +doDana.slice(8, 10));
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Trenutni sat u Zagrebu (0–23). */
export function satZagreb(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "numeric", hour12: false }).format(
      new Date(),
    ),
  );
}

function uUTC(dan: string) {
  const [g, m, d] = dan.split("-").map(Number);
  return new Date(Date.UTC(g, m - 1, d));
}

function izUTC(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

export function dodajDane(dan: string, broj: number): string {
  const d = uUTC(dan);
  d.setUTCDate(d.getUTCDate() + broj);
  return izUTC(d);
}

/** Ponedjeljak tjedna u kojem je zadani dan. */
export function ponedjeljak(dan: string): string {
  const d = uUTC(dan);
  const odPonedjeljka = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - odPonedjeljka);
  return izUTC(d);
}

const fmtDugi = new Intl.DateTimeFormat("hr-HR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "numeric",
});
const fmtKratkiDan = new Intl.DateTimeFormat("hr-HR", { timeZone: "UTC", weekday: "short" });
const fmtDanMjesec = new Intl.DateTimeFormat("hr-HR", {
  timeZone: "UTC",
  day: "numeric",
  month: "numeric",
});

function velikoSlovo(tekst: string) {
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/** "2026-10-24" -> "Subota, 24. 10." */
export function opisDana(dan: string) {
  return velikoSlovo(fmtDugi.format(uUTC(dan)));
}

/** "2026-10-24" -> "Sub" */
export function kratkiDan(dan: string) {
  return velikoSlovo(fmtKratkiDan.format(uUTC(dan)).replace(".", ""));
}

/** "2026-10-24" -> "24. 10." */
export function danMjesec(dan: string) {
  return fmtDanMjesec.format(uUTC(dan));
}

/** "2026-10-24" -> "24. 10. 2026." */
export function puniDatum(dan: string) {
  return formatDatuma.format(new Date(`${dan}T12:00:00Z`));
}
