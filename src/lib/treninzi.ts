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
  dan_u_tjednu: number;
  naziv: string;
  vjezbe: PlanVjezba[];
};

export type Plan = {
  id: string;
  naziv: string;
  opis: string;
  arhiviran: boolean;
  dani: PlanDan[];
};

export type Serija = {
  id: string;
  trening_id: string;
  vjezba_id: string;
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
      dan_u_tjednu: Number(d.dan_u_tjednu),
      naziv: String(d.naziv ?? ""),
      vjezbe: ((d.plan_vjezbe as Red[] | undefined) ?? [])
        .map(uPlanVjezbu)
        .sort((a, b) => a.redoslijed - b.redoslijed),
    }))
    .sort((a, b) => a.dan_u_tjednu - b.dan_u_tjednu);
  return {
    id: String(r.id),
    naziv: String(r.naziv ?? ""),
    opis: String(r.opis ?? ""),
    arhiviran: Boolean(r.arhiviran),
    dani,
  };
}

export function uSeriju(r: Red): Serija {
  return {
    id: String(r.id),
    trening_id: String(r.trening_id),
    vjezba_id: String(r.vjezba_id),
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
