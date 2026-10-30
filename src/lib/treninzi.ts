import { formatG } from "@/lib/makroi";

export const MISICNE_SKUPINE = [
  "Prsa",
  "Leđa",
  "Ramena",
  "Biceps",
  "Triceps",
  "Trbuh",
  "Noge",
  "Stražnja loža",
  "Gluteus",
  "Listovi",
  "Cijelo tijelo",
  "Kardio",
  "Ostalo",
] as const;

/** Indeks 0 = ponedjeljak (dan_u_tjednu = 1). */
export const DANI = ["Ponedjeljak", "Utorak", "Srijeda", "Četvrtak", "Petak", "Subota", "Nedjelja"];
export const DANI_KRATKO = ["Pon", "Uto", "Sri", "Čet", "Pet", "Sub", "Ned"];

export type Vjezba = {
  id: string;
  naziv: string;
  misicna_skupina: string;
  opis: string;
  youtube_url: string | null;
  slika_url: string | null;
  /** null = zajednička biblioteka; inače vlastita vježba tog klijenta */
  vlasnik_id: string | null;
};

export type PlanVjezba = {
  id: string;
  plan_dan_id: string;
  vjezba_id: string;
  redoslijed: number;
  serije: number;
  ponavljanja: string;
  kg: number | null;
  napomena: string;
  vjezba: Vjezba | null;
};

export type PlanDan = {
  id: string;
  plan_id: string;
  /** tjedan u ciklusu (1–4) */
  tjedan: number;
  dan_u_tjednu: number;
  naziv: string;
  /** mišićne skupine koje se taj dan rade, redom */
  skupine: string[];
  vjezbe: PlanVjezba[];
};

/** Program klijenta: vrti se u ciklusu od 1–4 tjedna, počevši od ponedjeljka `pocetak`. */
export type Plan = {
  id: string;
  naziv: string;
  opis: string;
  arhiviran: boolean;
  klijent_id: string | null;
  ciklus_tjedana: number;
  pocetak: string;
  dani: PlanDan[];
};

export const NAJVISE_TJEDANA = 4;
/** korak za brzu promjenu kilaže u programu */
export const KORAK_KG = 2.5;

export type Serija = {
  id: string;
  trening_id: string;
  vjezba_id: string;
  plan_vjezba_id: string | null;
  redni_broj: number;
  ponavljanja: number;
  kg: number;
};

export type Trening = {
  id: string;
  datum: string;
  plan_dan_id: string | null;
  naziv: string;
  zavrsen: boolean;
  serije: Serija[];
};

/** Upit za plan sa svim danima i vježbama. */
export const SELECT_PLANA = "*, plan_dani(*, plan_vjezbe(*, vjezba:vjezbe(*)))";

type Red = Record<string, unknown>;

export function uVjezbu(r: Red): Vjezba {
  return {
    id: String(r.id),
    naziv: String(r.naziv ?? ""),
    misicna_skupina: String(r.misicna_skupina ?? "Ostalo"),
    opis: String(r.opis ?? ""),
    youtube_url: r.youtube_url ? String(r.youtube_url) : null,
    slika_url: r.slika_url ? String(r.slika_url) : null,
    vlasnik_id: r.vlasnik_id ? String(r.vlasnik_id) : null,
  };
}

function uPlanVjezbu(r: Red): PlanVjezba {
  return {
    id: String(r.id),
    plan_dan_id: String(r.plan_dan_id),
    vjezba_id: String(r.vjezba_id),
    redoslijed: Number(r.redoslijed ?? 0),
    serije: Number(r.serije ?? 0),
    ponavljanja: String(r.ponavljanja ?? ""),
    kg: r.kg === null || r.kg === undefined ? null : Number(r.kg),
    napomena: String(r.napomena ?? ""),
    vjezba: r.vjezba ? uVjezbu(r.vjezba as Red) : null,
  };
}

export function uPlan(r: Red): Plan {
  const dani = ((r.plan_dani as Red[] | undefined) ?? [])
    .map((d) => ({
      id: String(d.id),
      plan_id: String(d.plan_id),
      tjedan: Number(d.tjedan ?? 1),
      dan_u_tjednu: Number(d.dan_u_tjednu),
      naziv: String(d.naziv ?? ""),
      skupine: Array.isArray(d.skupine) ? (d.skupine as unknown[]).map(String) : [],
      vjezbe: ((d.plan_vjezbe as Red[] | undefined) ?? [])
        .map(uPlanVjezbu)
        .sort((a, b) => a.redoslijed - b.redoslijed),
    }))
    .sort((a, b) => a.tjedan - b.tjedan || a.dan_u_tjednu - b.dan_u_tjednu);
  return {
    id: String(r.id),
    naziv: String(r.naziv ?? ""),
    opis: String(r.opis ?? ""),
    arhiviran: Boolean(r.arhiviran),
    klijent_id: r.klijent_id ? String(r.klijent_id) : null,
    ciklus_tjedana: Math.min(NAJVISE_TJEDANA, Math.max(1, Number(r.ciklus_tjedana ?? 1))),
    pocetak: String(r.pocetak ?? ""),
    dani,
  };
}

/** Koji je tjedan ciklusa (1…ciklus) za zadani dan. */
export function tjedanCiklusa(p: Pick<Plan, "ciklus_tjedana" | "pocetak">, dan: string): number {
  if (p.ciklus_tjedana <= 1 || !p.pocetak) return 1;
  const pon = ponedjeljakDana(dan);
  const tjedana = Math.round((Date.parse(`${pon}T00:00:00Z`) - Date.parse(`${p.pocetak}T00:00:00Z`)) / (7 * 86_400_000));
  return (((tjedana % p.ciklus_tjedana) + p.ciklus_tjedana) % p.ciklus_tjedana) + 1;
}

/** Ponedjeljak koji bi bio početak ciklusa da je zadani dan u tjednu `tjedan`. */
export function pocetakZaTjedan(dan: string, tjedan: number): string {
  const d = new Date(`${ponedjeljakDana(dan)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (tjedan - 1) * 7);
  return d.toISOString().slice(0, 10);
}

function ponedjeljakDana(dan: string): string {
  const d = new Date(`${dan}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Je li po programu (u razdoblju dodjele) taj dan trening? Za pridržavanje plana. */
export function jePlaniranTrening(
  dj: { od: string; do: string | null; ciklus: number; pocetak: string; dani: { tjedan: number; dan: number }[] },
  dan: string,
) {
  if (dj.od > dan || (dj.do !== null && dj.do <= dan)) return false;
  const tjedan = tjedanCiklusa({ ciklus_tjedana: dj.ciklus, pocetak: dj.pocetak }, dan);
  const broj = danUTjednu(dan);
  return dj.dani.some((d) => d.tjedan === tjedan && d.dan === broj);
}

/** Dodjela plana iz upita `plan:planovi(ciklus_tjedana, pocetak, plan_dani(tjedan, dan_u_tjednu))`. */
export function uDodjeluZaPridrzavanje(r: { od_datuma: unknown; do_datuma: unknown; plan: unknown }) {
  const plan = (Array.isArray(r.plan) ? r.plan[0] : r.plan) as
    | { naziv?: string; ciklus_tjedana?: number; pocetak?: string; plan_dani?: { tjedan?: number; dan_u_tjednu: number }[] }
    | null;
  return {
    od: String(r.od_datuma),
    do: r.do_datuma ? String(r.do_datuma) : null,
    naziv: plan?.naziv ?? null,
    ciklus: Number(plan?.ciklus_tjedana ?? 1),
    pocetak: String(plan?.pocetak ?? ""),
    dani: (plan?.plan_dani ?? []).map((x) => ({ tjedan: Number(x.tjedan ?? 1), dan: Number(x.dan_u_tjednu) })),
  };
}

/** Naziv treninga: zadani naziv, inače mišićne skupine, inače dan u tjednu. */
export function nazivDana(dan: Pick<PlanDan, "naziv" | "skupine" | "dan_u_tjednu">) {
  return dan.naziv || dan.skupine.join(" · ") || DANI[dan.dan_u_tjednu - 1];
}

/**
 * Vježbe dana po mišićnim skupinama, redom kojim su skupine zadane.
 * Vježbe iz skupine koja nije zadana dolaze na kraj, pod svojom skupinom.
 */
export function poSkupinama<T extends { vjezba: Vjezba | null }>(dan: {
  skupine: string[];
  vjezbe: T[];
}): { skupina: string; vjezbe: T[] }[] {
  const redom = [...dan.skupine];
  for (const pv of dan.vjezbe) {
    const s = pv.vjezba?.misicna_skupina ?? "Ostalo";
    if (!redom.includes(s)) redom.push(s);
  }
  return redom.map((skupina) => ({
    skupina,
    vjezbe: dan.vjezbe.filter((pv) => (pv.vjezba?.misicna_skupina ?? "Ostalo") === skupina),
  }));
}

/** Najveća i zadnja kilaža klijenta na vježbi (iz upisanih serija). */
export type Kilaza = {
  vjezbaId: string;
  maxKg: number | null;
  maxPonavljanja: number | null;
  /** broj serija na treningu na kojem je postignuta najveća kilaža */
  maxSerija: number | null;
  maxDatum: string | null;
  zadnjaKg: number | null;
  zadnjaPonavljanja: number | null;
  zadnjiDatum: string | null;
};

export function uKilazu(r: Red): Kilaza {
  const broj = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    vjezbaId: String(r.vjezba_id),
    maxKg: broj(r.max_kg),
    maxPonavljanja: broj(r.max_ponavljanja),
    maxSerija: broj(r.max_serija),
    maxDatum: r.max_datum ? String(r.max_datum) : null,
    zadnjaKg: broj(r.zadnja_kg),
    zadnjaPonavljanja: broj(r.zadnja_ponavljanja),
    zadnjiDatum: r.zadnji_datum ? String(r.zadnji_datum) : null,
  };
}

export function uSeriju(r: Red): Serija {
  return {
    id: String(r.id),
    trening_id: String(r.trening_id),
    vjezba_id: String(r.vjezba_id),
    plan_vjezba_id: r.plan_vjezba_id ? String(r.plan_vjezba_id) : null,
    redni_broj: Number(r.redni_broj),
    ponavljanja: Number(r.ponavljanja),
    kg: Number(r.kg),
  };
}

export function uTrening(r: Red): Trening {
  return {
    id: String(r.id),
    datum: String(r.datum),
    plan_dan_id: r.plan_dan_id ? String(r.plan_dan_id) : null,
    naziv: String(r.naziv ?? ""),
    zavrsen: Boolean(r.zavrsen),
    serije: ((r.serije as Red[] | undefined) ?? []).map(uSeriju),
  };
}

/** Pripada li serija ovom mjestu u planu i ovoj (stvarno izvedenoj) vježbi? */
export function serijaZaMjesto(s: Serija, pv: PlanVjezba, izvedenaVjezbaId: string) {
  if (s.vjezba_id !== izvedenaVjezbaId) return false;
  // Starije serije (prije zamjena) nemaju plan_vjezba_id.
  return s.plan_vjezba_id === pv.id || (s.plan_vjezba_id === null && s.vjezba_id === pv.vjezba_id);
}

/** "2026-10-24" -> 6 (subota); 1 = ponedjeljak … 7 = nedjelja */
export function danUTjednu(dan: string): number {
  const [g, m, d] = dan.split("-").map(Number);
  const js = new Date(Date.UTC(g, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Izvlači YouTube ID iz bilo kojeg uobičajenog oblika linka. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

/** "4 × 8–10 · 60 kg" */
export function opisCilja(pv: Pick<PlanVjezba, "serije" | "ponavljanja" | "kg">) {
  const ponavljanja = pv.ponavljanja.replace(/\s*-\s*/g, "–");
  const kg = pv.kg !== null && pv.kg > 0 ? ` · ${formatG(pv.kg)} kg` : "";
  return `${pv.serije} × ${ponavljanja}${kg}`;
}

/** Prvi broj iz "8-10" -> 8 (za predložak unosa). */
export function prviBroj(tekst: string): number | null {
  const m = tekst.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Je li greška zbog toga što se zapis koristi negdje drugdje (strani ključ). */
export function jeGreskaVeze(poruka: string | undefined) {
  return Boolean(poruka && /foreign key|violates|23503/i.test(poruka));
}
