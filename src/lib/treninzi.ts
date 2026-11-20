import { formatG } from "@/lib/makroi";

export const MISICNE_SKUPINE = [
  "Prsa",
  "Leđa",
  "Ramena",
  "Biceps",
  "Triceps",
  "Trbuh",
  "Kvadriceps",
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
  /** broj ponavljanja, a ako je `sekunde` – broj sekundi */
  ponavljanja: number;
  kg: number;
  sekunde: boolean;
  /** opterećenje riječju umjesto kilaže (npr. "žuta guma") */
  rijec: string | null;
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

/** Skupina "Noge" je preimenovana u "Kvadriceps" (stari zapisi se prikazuju pod novim imenom). */
export function uSkupinu(s: unknown): string {
  const t = String(s ?? "Ostalo");
  return t === "Noge" ? "Kvadriceps" : t;
}

export function uVjezbu(r: Red): Vjezba {
  return {
    id: String(r.id),
    naziv: String(r.naziv ?? ""),
    misicna_skupina: uSkupinu(r.misicna_skupina),
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
      skupine: Array.isArray(d.skupine) ? (d.skupine as unknown[]).map(uSkupinu) : [],
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
  /** najteža / zadnja serija je bila u sekundama */
  maxSekunde: boolean;
  zadnjaSekunde: boolean;
  /** zadnja serija s opterećenjem riječju (npr. "žuta guma") */
  zadnjaRijec: string | null;
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
    maxSekunde: r.max_sekunde === true,
    zadnjaSekunde: r.zadnja_sekunde === true,
    zadnjaRijec: r.zadnja_rijec ? String(r.zadnja_rijec) : null,
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
    sekunde: r.sekunde === true,
    rijec: r.rijec ? String(r.rijec) : null,
  };
}

type OdradjenaSerija = { ponavljanja: number; kg: number; sekunde?: boolean; rijec?: string | null };

/** Jedna odrađena serija: "10 × 40 kg", "60 s × 5 kg", "60 s", "10 × žuta guma". */
export function opisOdradjene(s: OdradjenaSerija) {
  const t = `${s.ponavljanja}${s.sekunde ? " s" : ""}`;
  if (s.rijec) return `${t} × ${s.rijec}`;
  if (s.sekunde && !(s.kg > 0)) return t;
  return `${t} × ${formatG(s.kg)} kg`;
}

/**
 * Odrađene serije u jednom retku: "10×40, 8×45" (+ " kg" ako `sKg`);
 * sa sekundama ili riječju svaka serija posebno: "60 s × 5 kg, 45 s × 5 kg".
 */
export function opisOdradjenih(serije: OdradjenaSerija[], sKg = true) {
  if (serije.some((s) => s.sekunde || s.rijec)) return serije.map(opisOdradjene).join(", ");
  return `${serije.map((s) => `${s.ponavljanja}×${formatG(s.kg)}`).join(", ")}${sKg ? " kg" : ""}`;
}

/** Volumen serije (kg × ponavljanja); serije u sekundama se ne računaju. */
export function volumenSerije(s: OdradjenaSerija) {
  return s.sekunde ? 0 : s.kg * s.ponavljanja;
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

/**
 * Plan jedne serije (trening iz kalendara može imati različita ponavljanja i kilažu po seriji).
 * `sekunde`: ponavljanja su zapravo sekunde (npr. plank 60 s). `rijec`: opterećenje riječju umjesto kilaže (npr. "žuta guma").
 */
export type SerijaPlana = { ponavljanja: string; kg: number | null; sekunde?: true; rijec?: string };

/** serije_plan iz baze → popis serija (null = sve serije iste). */
export function uSerijePlana(v: unknown): SerijaPlana[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>;
    const kg = r.kg === null || r.kg === undefined || r.kg === "" ? null : Number(r.kg);
    const serija: SerijaPlana = { ponavljanja: String(r.ponavljanja ?? ""), kg: kg !== null && Number.isFinite(kg) ? kg : null };
    if (r.sekunde === true) serija.sekunde = true;
    if (typeof r.rijec === "string" && r.rijec.trim()) {
      serija.rijec = r.rijec.trim().slice(0, 40);
      serija.kg = null;
    }
    return serija;
  });
}

const istaSerija = (a: SerijaPlana, b: SerijaPlana) =>
  a.ponavljanja === b.ponavljanja && a.kg === b.kg && !a.sekunde === !b.sekunde && (a.rijec ?? "") === (b.rijec ?? "");

/** Plan svake serije redom (iz serije_plan ili, ako ga nema, serije × ponavljanja × kg). */
export function serijePlana(pv: {
  serije: number;
  ponavljanja: string;
  kg: number | null;
  serije_plan?: SerijaPlana[] | null;
}): SerijaPlana[] {
  if (pv.serije_plan?.length) return pv.serije_plan;
  return Array.from({ length: Math.max(1, pv.serije) }, () => ({ ponavljanja: pv.ponavljanja, kg: pv.kg }));
}

const crtica = (t: string) => t.replace(/\s*-\s*/g, "–");

/** "4 × 8–10 · 60 kg", "3 × 60 s · 5 kg", "3 × 10 · žuta guma" */
function opisJednakih(serije: number, ponavljanja: string, kg: number | null, sekunde?: boolean, rijec?: string) {
  const opterecenje = rijec ? ` · ${rijec}` : kg !== null && kg > 0 ? ` · ${formatG(kg)} kg` : "";
  return `${serije} × ${crtica(ponavljanja)}${sekunde ? " s" : ""}${opterecenje}`;
}

/** Jedna serija iz plana: "60 s × 5 kg", "10 × žuta guma", "12" */
function opisJedneSerije(x: SerijaPlana) {
  const t = `${crtica(x.ponavljanja)}${x.sekunde ? " s" : ""}`;
  if (x.rijec) return `${t} × ${x.rijec}`;
  return x.kg !== null && x.kg > 0 ? `${t} × ${formatG(x.kg)} kg` : t;
}

/** Serije po seriji: "12×40, 10×45, 8×50 kg"; ako su sve iste, kratko "3 × 10 · 50 kg". */
export function opisSerija(s: SerijaPlana[]) {
  if (s.every((x) => istaSerija(x, s[0]))) {
    return opisJednakih(s.length, s[0].ponavljanja, s[0].kg, s[0].sekunde, s[0].rijec);
  }
  // sa sekundama ili riječju svaka serija posebno
  if (s.some((x) => x.sekunde || x.rijec)) return s.map(opisJedneSerije).join(", ");
  if (s.some((x) => x.kg !== null && x.kg > 0)) {
    return `${s.map((x) => (x.kg !== null && x.kg > 0 ? `${crtica(x.ponavljanja)}×${formatG(x.kg)}` : crtica(x.ponavljanja))).join(", ")} kg`;
  }
  return `${s.length} ser.: ${s.map((x) => crtica(x.ponavljanja)).join(", ")}`;
}

/** "4 × 8–10 · 60 kg", a s različitim serijama "12×40, 10×45, 8×50 kg" */
export function opisCilja(pv: Pick<PlanVjezba, "serije" | "ponavljanja" | "kg"> & { serije_plan?: SerijaPlana[] | null }) {
  if (pv.serije_plan?.length) return opisSerija(pv.serije_plan);
  return opisJednakih(pv.serije, pv.ponavljanja, pv.kg);
}

/**
 * Serije po seriji → zapis vježbe u treningu: broj serija, ponavljanja prve serije, najveća kilaža
 * i serije_plan (null ako su sve serije iste – tada vrijedi serije × ponavljanja × kg).
 * Sekunde i riječ postoje samo u serije_plan, pa se tada on uvijek sprema.
 */
export function sazmiSerije(plan: SerijaPlana[]) {
  const sveIste = plan.every((s) => istaSerija(s, plan[0]));
  const posebno = plan.some((s) => s.sekunde || s.rijec);
  const kilaze = plan.map((s) => s.kg).filter((x): x is number => x !== null);
  return {
    serije: plan.length,
    ponavljanja: plan[0].ponavljanja,
    kg: sveIste ? plan[0].kg : kilaze.length ? Math.max(...kilaze) : null,
    serije_plan: sveIste && !posebno ? null : plan,
  };
}

/** Bazna vježba klijenta: njegove serije (ponavljanja × kg po seriji) i stalna napomena (npr. "sjedalo lvl3"). */
export type PodaciBazne = { serije_plan: SerijaPlana[] | null; napomena: string };

export function uPodatkeBazne(r: Record<string, unknown>): PodaciBazne {
  return { serije_plan: uSerijePlana(r.serije_plan), napomena: String(r.napomena ?? "") };
}

/** "bazno 12×40, 10×45, 8×50 kg" (ili null ako trener nije upisao serije) */
export function kratkoPolazno(b: PodaciBazne | null | undefined) {
  return b?.serije_plan?.length ? `bazno ${opisSerija(b.serije_plan)}` : null;
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
