// Treninzi iz kalendara (klijenti uživo): trener za termin (klijent + datum) slaže
// mišićne skupine i vježbe, a na treningu upisuje odrađene serije.
import { prviBroj, uSeriju, uVjezbu, type Serija, type Vjezba } from "@/lib/treninzi";

export type TreningVjezba = {
  id: string;
  trening_id: string;
  vjezba_id: string;
  redoslijed: number;
  serije: number;
  ponavljanja: string;
  kg: number | null;
  napomena: string;
  vjezba: Vjezba | null;
};

export type TreningKalendara = {
  id: string;
  klijent_id: string;
  datum: string;
  naziv: string;
  skupine: string[];
  zavrsen: boolean;
  /** trener je označio da klijent nije došao (ne ulazi u statistiku) */
  nijeDosao: boolean;
  vjezbe: TreningVjezba[];
  serije: Serija[];
};

/** Upit za trening iz kalendara s vježbama i upisanim serijama. */
export const SELECT_TRENINGA = "*, vjezbe:trening_vjezbe(*, vjezba:vjezbe(*)), serije:odradjene_serije(*)";

type Red = Record<string, unknown>;

export function uTreningKalendara(r: Red): TreningKalendara {
  return {
    id: String(r.id),
    klijent_id: String(r.klijent_id),
    datum: String(r.datum),
    naziv: String(r.naziv ?? ""),
    skupine: Array.isArray(r.skupine) ? (r.skupine as unknown[]).map(String) : [],
    zavrsen: Boolean(r.zavrsen),
    nijeDosao: Boolean(r.nije_dosao),
    vjezbe: ((r.vjezbe as Red[] | undefined) ?? [])
      .map((v) => ({
        id: String(v.id),
        trening_id: String(v.trening_id),
        vjezba_id: String(v.vjezba_id),
        redoslijed: Number(v.redoslijed ?? 0),
        serije: Number(v.serije ?? 3),
        ponavljanja: String(v.ponavljanja ?? ""),
        kg: v.kg === null || v.kg === undefined ? null : Number(v.kg),
        napomena: String(v.napomena ?? ""),
        vjezba: v.vjezba ? uVjezbu(v.vjezba as Red) : null,
      }))
      .sort((a, b) => a.redoslijed - b.redoslijed),
    serije: ((r.serije as Red[] | undefined) ?? []).map(uSeriju),
  };
}

/** Kratki naziv za kalendar: "Prsa · Triceps" */
export function nazivTreninga(t: { skupine: string[]; naziv?: string }) {
  return t.skupine.join(" · ") || t.naziv || "Trening";
}

/** Kratice skupina za usku mrežu kalendara. */
const KRATICE: Record<string, string> = {
  Prsa: "Prsa",
  Leđa: "Leđa",
  Ramena: "Ram",
  Biceps: "Bic",
  Triceps: "Tri",
  Trbuh: "Trb",
  Noge: "Noge",
  "Stražnja loža": "Lož",
  Gluteus: "Glut",
  Listovi: "List",
  "Cijelo tijelo": "CT",
  Kardio: "Kard",
  Ostalo: "Ost",
};

export function kratkeSkupine(skupine: string[]) {
  return skupine.map((s) => KRATICE[s] ?? s.slice(0, 4)).join("·");
}

/** Upisane serije jedne vježbe na treningu iz kalendara (bez mjesta u programu). */
export function serijeVjezbe(t: Pick<TreningKalendara, "serije">, vjezbaId: string) {
  return t.serije.filter((s) => s.vjezba_id === vjezbaId && s.plan_vjezba_id === null).sort((a, b) => a.redni_broj - b.redni_broj);
}

/** Predložak broja ponavljanja iz "8-10" -> "8" */
export function predlozakPonavljanja(ponavljanja: string) {
  const n = prviBroj(ponavljanja);
  return n === null ? "" : String(n);
}

/** Ključ za povezivanje termina i treninga. */
export const kljucTreninga = (klijentId: string, datum: string) => `${klijentId}|${datum}`;
