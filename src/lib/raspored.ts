// Raspored termina s trenerom: stalni tjedni termini + iznimke + dodatni termini.
// Čiste funkcije (bez baze) – koriste ih i aplikacija i poslužitelj (e-mail).
import { dodajDane, opisDana } from "@/lib/datum";
import { DANI, danUTjednu } from "@/lib/treninzi";

export type Pravilo = {
  id: string;
  klijent_id: string;
  dan_u_tjednu: number;
  vrijeme: string; // "18:00"
  trajanje_min: number;
  od_datuma: string;
  /** zadnji dan stalnog termina (ukinut termin) ili null ako traje */
  do_datuma: string | null;
  napomena: string;
};

/** Stalni termini koji još traju (ukinuti ostaju samo zbog povijesti u rasporedu). */
export function aktivnaPravila(pravila: Pravilo[], danas: string) {
  return pravila.filter((p) => p.do_datuma === null || p.do_datuma >= danas);
}

export type Iznimka = {
  id: string;
  pravilo_id: string;
  datum: string;
  otkazan: boolean;
  novi_datum: string | null;
  novo_vrijeme: string | null;
};

export type Dodatni = {
  id: string;
  klijent_id: string;
  datum: string;
  vrijeme: string;
  trajanje_min: number;
  napomena: string;
};

export type Termin = {
  kljuc: string;
  klijentId: string;
  datum: string;
  vrijeme: string;
  trajanje: number;
  otkazan: boolean;
  napomena: string;
  /** stalni termin (iz pravila) ili dodatni jednokratni */
  pravilo: Pravilo | null;
  izvorniDatum: string | null;
  iznimka: Iznimka | null;
  dodatni: Dodatni | null;
};

type Red = Record<string, unknown>;

/** "18:00:00" -> "18:00" */
export function hhmm(t: unknown) {
  return String(t ?? "").slice(0, 5);
}

export function uPravilo(r: Red): Pravilo {
  return {
    id: String(r.id),
    klijent_id: String(r.klijent_id),
    dan_u_tjednu: Number(r.dan_u_tjednu),
    vrijeme: hhmm(r.vrijeme),
    trajanje_min: Number(r.trajanje_min ?? 60),
    od_datuma: String(r.od_datuma),
    do_datuma: r.do_datuma ? String(r.do_datuma) : null,
    napomena: String(r.napomena ?? ""),
  };
}

export function uIznimku(r: Red): Iznimka {
  return {
    id: String(r.id),
    pravilo_id: String(r.pravilo_id),
    datum: String(r.datum),
    otkazan: Boolean(r.otkazan),
    novi_datum: r.novi_datum ? String(r.novi_datum) : null,
    novo_vrijeme: r.novo_vrijeme ? hhmm(r.novo_vrijeme) : null,
  };
}

export function uDodatni(r: Red): Dodatni {
  return {
    id: String(r.id),
    klijent_id: String(r.klijent_id),
    datum: String(r.datum),
    vrijeme: hhmm(r.vrijeme),
    trajanje_min: Number(r.trajanje_min ?? 60),
    napomena: String(r.napomena ?? ""),
  };
}

/** Pretvara pravila, iznimke i dodatne termine u konkretne termine u razdoblju [od, doDana]. */
export function razvijTermine(
  pravila: Pravilo[],
  iznimke: Iznimka[],
  dodatni: Dodatni[],
  od: string,
  doDana: string,
): Termin[] {
  const rez: Termin[] = [];
  const poKljucu = new Map(iznimke.map((i) => [`${i.pravilo_id}|${i.datum}`, i]));
  // Termin pomaknut iz dana izvan razdoblja može upasti u razdoblje – gledamo ±31 dan.
  const pocetak = dodajDane(od, -31);
  const kraj = dodajDane(doDana, 31);

  for (const p of pravila) {
    let d = p.od_datuma > pocetak ? p.od_datuma : pocetak;
    // prvi odgovarajući dan u tjednu
    while (danUTjednu(d) !== p.dan_u_tjednu) d = dodajDane(d, 1);
    const krajPravila = p.do_datuma && p.do_datuma < kraj ? p.do_datuma : kraj;
    for (; d <= krajPravila; d = dodajDane(d, 7)) {
      const iz = poKljucu.get(`${p.id}|${d}`) ?? null;
      const datum = iz && !iz.otkazan && iz.novi_datum ? iz.novi_datum : d;
      const vrijeme = iz && !iz.otkazan && iz.novo_vrijeme ? iz.novo_vrijeme : p.vrijeme;
      if (datum < od || datum > doDana) continue;
      // ukinut stalni termin (ili arhiviran klijent): ni pomaknuti termin ne ide iza zadnjeg dana
      if (p.do_datuma && datum > p.do_datuma) continue;
      rez.push({
        kljuc: `p|${p.id}|${d}`,
        klijentId: p.klijent_id,
        datum,
        vrijeme,
        trajanje: p.trajanje_min,
        otkazan: Boolean(iz?.otkazan),
        napomena: p.napomena,
        pravilo: p,
        izvorniDatum: d,
        iznimka: iz,
        dodatni: null,
      });
    }
  }

  for (const x of dodatni) {
    if (x.datum < od || x.datum > doDana) continue;
    rez.push({
      kljuc: `d|${x.id}`,
      klijentId: x.klijent_id,
      datum: x.datum,
      vrijeme: x.vrijeme,
      trajanje: x.trajanje_min,
      otkazan: false,
      napomena: x.napomena,
      pravilo: null,
      izvorniDatum: null,
      iznimka: null,
      dodatni: x,
    });
  }

  return rez.sort((a, b) => (a.datum + a.vrijeme).localeCompare(b.datum + b.vrijeme));
}

/** "Ponedjeljak, 27. 10. u 18:00" */
export function opisTermina(t: Pick<Termin, "datum" | "vrijeme">) {
  return `${opisDana(t.datum)} u ${t.vrijeme}`;
}

/** "Pon 18:00" za stalni termin */
export function opisPravila(p: Pick<Pravilo, "dan_u_tjednu" | "vrijeme" | "trajanje_min">) {
  return `${DANI[p.dan_u_tjednu - 1]} u ${p.vrijeme} (${p.trajanje_min} min)`;
}

/** Je li termin pomaknut s izvornog dana/sata? */
export function jePomaknut(t: Termin) {
  return Boolean(t.iznimka && !t.iznimka.otkazan);
}
