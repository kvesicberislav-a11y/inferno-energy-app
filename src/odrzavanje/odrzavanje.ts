// Dnevno održavanje (Cloudflare Cron, svaki dan oko 3–4 h po zagrebačkom vremenu):
// 1. provjera baze – ujedno je drži "budnom" (besplatni Supabase pauzira projekt nakon 7 dana mirovanja)
// 2. sigurnosna kopija svih tablica i popisa korisnika u Cloudflare KV
//    (dnevne kopije čuvaju se 14 dana, nedjeljne 9 tjedana)
// 3. provjera zauzeća (baza 500 MB, datoteke 1 GB na besplatnom planu)
// 4. ako nešto ne valja → obavijest na mobitel trenerima
// Pokreće ga worker.mjs; ne koristi Next.js ni "server-only".
import { danasZagreb } from "../lib/datum";
import { posaljiPush, posiljatelj, type Uredjaj } from "../lib/push";

/** Javne adrese (nisu tajne). Ako Cloudflare ima varijablu, ona ima prednost. */
const URL_BAZE = "https://ifqoqzcsdwnkezvfuobv.supabase.co";
const ADRESA_APLIKACIJE = "https://inferno-energy-app.kvesic-berislav.workers.dev";

/** Tablice za kopiju (push_pretplate namjerno ne – uređaji se sami ponovno prijave). */
/** Tablice bez stupca id – stalni redoslijed za kopiju u dijelovima. */
const REDOSLIJED: Record<string, string> = { bazne_vjezbe: "klijent_id,vjezba_id" };

export const TABLICE = [
  "profili",
  "pozivnice",
  "ciljevi_makroa",
  "obroci",
  "namirnice",
  "vjezbe",
  "bazne_vjezbe",
  "planovi",
  "plan_dani",
  "plan_vjezbe",
  "dodjele_planova",
  "treninzi",
  "trening_vjezbe",
  "odradjene_serije",
  "zamjene_vjezbi",
  "mjerenja",
  "slike_napretka",
  "biljeske_trenera",
  "termini_pravila",
  "termini_iznimke",
  "termini_dodatni",
  "poruke",
] as const;

const REDOVA_PO_DIJELU = 20_000;
const DAN = 24 * 60 * 60;
const MB = 1024 * 1024;
const GRANICA_BAZE = 400 * MB; // 80 % od 500 MB
const GRANICA_DATOTEKA = 800 * MB; // 80 % od 1 GB

type KV = {
  get(kljuc: string): Promise<string | null>;
  put(kljuc: string, vrijednost: string | ReadableStream, opcije?: { expirationTtl?: number }): Promise<void>;
};

export type OkruzenjeOdrzavanja = {
  KOPIJE?: KV;
  SUPABASE_SECRET_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  VAPID_PRIVATE_JWK?: string;
};

export type Izvjestaj = {
  vrijeme: string;
  trajanjeMs: number;
  ok: boolean;
  baza: { odgovara: boolean; mb?: number; datotekeMb?: number; brojDatoteka?: number; klijenata?: number };
  kopija: { datum: string; cuvaSeDana: number; redova: Record<string, number>; korisnika: boolean } | null;
  upozorenja: string[];
  greske: string[];
  obavijestiPoslano: number;
};

type Stanje = {
  baza_bajtova: number;
  datoteke_bajtova: number;
  broj_datoteka: number;
  klijenata: number;
  uredjaji_trenera: Uredjaj[];
};

function ukupnoIzRaspona(zaglavlje: string | null): number | null {
  // "0-19999/45000" ili "*/0"
  const m = /\/(\d+)$/.exec(zaglavlje ?? "");
  return m ? Number(m[1]) : null;
}

export async function dnevnoOdrzavanje(
  env: OkruzenjeOdrzavanja,
  opcije: { kopija?: boolean; obavijest?: boolean } = {},
): Promise<Izvjestaj> {
  const pocetak = Date.now();
  const izvjestaj: Izvjestaj = {
    vrijeme: new Date().toISOString(),
    trajanjeMs: 0,
    ok: false,
    baza: { odgovara: false },
    kopija: null,
    upozorenja: [],
    greske: [],
    obavijestiPoslano: 0,
  };
  const url = env.NEXT_PUBLIC_SUPABASE_URL || URL_BAZE;
  const kljuc = env.SUPABASE_SECRET_KEY;
  const kv = env.KOPIJE;
  let uredjajiTrenera: Uredjaj[] = [];

  if (!kljuc) izvjestaj.greske.push("Poslužitelju nedostaje ključ baze.");
  const zaglavlja = { apikey: kljuc ?? "", Authorization: `Bearer ${kljuc ?? ""}`, "User-Agent": "inferno-odrzavanje" };

  // 1) Provjera baze i zauzeća
  if (kljuc) {
    try {
      const r = await fetch(`${url}/rest/v1/rpc/stanje_sustava`, {
        method: "POST",
        headers: { ...zaglavlja, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const s = (await r.json()) as Stanje;
      izvjestaj.baza = {
        odgovara: true,
        mb: Math.round((s.baza_bajtova / MB) * 10) / 10,
        datotekeMb: Math.round((s.datoteke_bajtova / MB) * 10) / 10,
        brojDatoteka: s.broj_datoteka,
        klijenata: s.klijenata,
      };
      uredjajiTrenera = s.uredjaji_trenera ?? [];
      if (s.baza_bajtova > GRANICA_BAZE) {
        izvjestaj.upozorenja.push(`Baza je skoro puna (${izvjestaj.baza.mb} od 500 MB).`);
      }
      if (s.datoteke_bajtova > GRANICA_DATOTEKA) {
        izvjestaj.upozorenja.push(`Prostor za slike je skoro pun (${izvjestaj.baza.datotekeMb} od 1024 MB).`);
      }
      // zapamti uređaje trenera – da upozorenje stigne i kad baza ne radi
      if (kv) await kv.put("stanje/uredjaji_trenera", JSON.stringify(uredjajiTrenera));
    } catch (e) {
      izvjestaj.greske.push(`Baza ne odgovara (${e instanceof Error ? e.message : "greška"}).`);
    }
  }

  // 2) Sigurnosna kopija
  if (opcije.kopija !== false && kv && kljuc && izvjestaj.baza.odgovara) {
    const datum = danasZagreb();
    const nedjelja = new Date(`${datum}T12:00:00Z`).getUTCDay() === 0;
    const ttl = (nedjelja ? 63 : 14) * DAN;
    const kopija = { datum, cuvaSeDana: ttl / DAN, redova: {} as Record<string, number>, korisnika: false };
    for (const tablica of TABLICE) {
      try {
        let od = 0;
        let dio = 0;
        let ukupno: number | null = null;
        do {
          const r = await fetch(
            `${url}/rest/v1/${tablica}?select=*&order=${REDOSLIJED[tablica] ?? "id"}&limit=${REDOVA_PO_DIJELU}&offset=${od}`,
            // JSON čuva točne vrijednosti (prazno/null, brojevi) – baza ga vraća izravno (json_populate_recordset)
            { headers: { ...zaglavlja, Accept: "application/json", Prefer: "count=exact" } },
          );
          if (!r.ok || !r.body) throw new Error(`status ${r.status}`);
          ukupno = ukupnoIzRaspona(r.headers.get("content-range"));
          // tijelo ide ravno u KV (bez obrade – štedi procesorsko vrijeme)
          await kv.put(`kopija/${datum}/${tablica}${dio ? `.${dio}` : ""}.json`, r.body, { expirationTtl: ttl });
          od += REDOVA_PO_DIJELU;
          dio++;
        } while (ukupno !== null && od < ukupno);
        kopija.redova[tablica] = ukupno ?? -1;
      } catch (e) {
        izvjestaj.greske.push(`Kopija tablice ${tablica} nije uspjela (${e instanceof Error ? e.message : "greška"}).`);
      }
    }
    try {
      const r = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: zaglavlja });
      if (!r.ok || !r.body) throw new Error(`status ${r.status}`);
      await kv.put(`kopija/${datum}/auth_korisnici.json`, r.body, { expirationTtl: ttl });
      kopija.korisnika = true;
    } catch (e) {
      izvjestaj.greske.push(`Kopija popisa korisnika nije uspjela (${e instanceof Error ? e.message : "greška"}).`);
    }
    izvjestaj.kopija = kopija;
  } else if (opcije.kopija !== false && !kv) {
    izvjestaj.greske.push("Spremište za kopije (KV) nije povezano.");
  }

  // 3) Upozorenje trenerima ako nešto ne valja
  if (opcije.obavijest && (izvjestaj.greske.length || izvjestaj.upozorenja.length)) {
    try {
      if (!uredjajiTrenera.length && kv) {
        uredjajiTrenera = JSON.parse((await kv.get("stanje/uredjaji_trenera")) ?? "[]") as Uredjaj[];
      }
      const vapid = await posiljatelj(env.VAPID_PRIVATE_JWK, ADRESA_APLIKACIJE);
      if (vapid) {
        const prvi = izvjestaj.greske[0] ?? izvjestaj.upozorenja[0];
        const statusi = await Promise.all(
          uredjajiTrenera.slice(0, 6).map((u) =>
            posaljiPush(vapid, u, {
              title: "⚠️ Aplikacija – dnevna provjera",
              body: `${prvi} Javi Berislavu (održavanje).`,
              url: "/trener",
              tag: "odrzavanje",
            }).catch(() => 0),
          ),
        );
        izvjestaj.obavijestiPoslano = statusi.filter((s) => s >= 200 && s < 300).length;
      }
    } catch {
      // upozorenje nije uspjelo – ostaje zapisano u izvještaju
    }
  }

  izvjestaj.ok = izvjestaj.greske.length === 0;
  izvjestaj.trajanjeMs = Date.now() - pocetak;
  if (kv) {
    try {
      await kv.put("stanje/zadnje", JSON.stringify(izvjestaj));
      if (izvjestaj.kopija) {
        await kv.put(`kopija/${izvjestaj.kopija.datum}/_sazetak.json`, JSON.stringify(izvjestaj), {
          expirationTtl: izvjestaj.kopija.cuvaSeDana * DAN,
        });
        if (izvjestaj.ok) await kv.put("stanje/zadnja_uspjesna_kopija", izvjestaj.kopija.datum);
      }
    } catch {
      // izvještaj se vraća i bez spremanja
    }
  }
  return izvjestaj;
}
