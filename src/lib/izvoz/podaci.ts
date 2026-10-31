// Dohvat svih podataka jednog klijenta za izvoz (Excel / PDF).
import { brojDana, danasZagreb, dodajDane } from "@/lib/datum";
import { ciljZaDan, uCilj, uObrok, type Cilj, type Obrok } from "@/lib/makroi";
import { prviDatumKlijenta } from "@/lib/prviDatum";
import { supabase } from "@/lib/supabase/client";
import { uMjerenje, uOsobnePodatke, type Mjerenje, type OsobniPodaci } from "@/lib/tijelo";
import { jePlaniranTrening, uDodjeluZaPridrzavanje } from "@/lib/treninzi";

export type SerijaIzvoza = { vjezba: string; vjezbaId: string; redni: number; ponavljanja: number; kg: number };
export type TreningIzvoza = { datum: string; naziv: string; zavrsen: boolean; serije: SerijaIzvoza[] };
export type DanPrehrane = {
  datum: string;
  kcal: number;
  proteini: number;
  ugljikohidrati: number;
  masti: number;
  cilj: Cilj | null;
};

export type PodaciIzvoza = {
  klijent: { ime: string; email: string; nacin: string; kreirano: string } & OsobniPodaci;
  od: string; // prvi dan razdoblja
  doDana: string; // zadnji dan (danas)
  sveVrijeme: boolean;
  /** vježbe za napredak u izvještaju (id-jevi) ili null = sve */
  praceneVjezbe: string[] | null;
  plan: string | null;
  obroci: Obrok[];
  dani: DanPrehrane[]; // samo dani s unosom
  ciljevi: Cilj[]; // od najnovijeg
  mjerenja: Mjerenje[]; // od najstarijeg, unutar razdoblja
  svaMjerenja: Mjerenje[]; // sva (za "početak" i trenutno stanje)
  treninzi: TreningIzvoza[]; // od najstarijeg
  pridrzavanje: {
    danaURazdoblju: number;
    danaSPrehranom: number;
    planiranihTreninga: number;
    odradenihTreninga: number;
  };
};

const STRANICA = 1000;

/** Dohvaća sve redove (PostgREST vraća najviše 1000 odjednom). */
async function sveStranice<T>(
  upit: (od: number, doReda: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rez: T[] = [];
  for (let i = 0; ; i += STRANICA) {
    const { data, error } = await upit(i, i + STRANICA - 1);
    if (error) throw new Error(error.message);
    rez.push(...(data ?? []));
    if (!data || data.length < STRANICA) break;
  }
  return rez;
}

type Red = Record<string, unknown>;

/** `dana` = broj dana unatrag (30, 90…) ili null za cijelo vrijeme. */
export async function dohvatiPodatkeIzvoza(
  klijentId: string,
  dana: number | null,
  praceneVjezbe: string[] | null = null,
): Promise<PodaciIzvoza> {
  const sb = supabase();
  const doDana = danasZagreb();

  const { data: profil, error: gp } = await sb
    .from("profili")
    .select("ime, email, nacin, kreirano, visina_cm, spol, godina_rodenja")
    .eq("id", klijentId)
    .maybeSingle();
  if (gp || !profil) throw new Error(gp?.message ?? "Klijent nije pronađen.");

  // od prvog podatka (može biti i prije registracije, npr. povijest unesena iz tablice)
  const pocetak = await prviDatumKlijenta(klijentId, String(profil.kreirano));
  const od = dana === null ? pocetak : [dodajDane(doDana, -(dana - 1)), pocetak].sort()[1];

  const [obrociRedovi, ciljeviR, mjerenjaR, treninziR, dodjeleR] = await Promise.all([
    sveStranice<Red>((a, b) =>
      sb
        .from("obroci")
        .select("*")
        .eq("klijent_id", klijentId)
        .gte("datum", od)
        .lte("datum", doDana)
        .order("datum")
        .order("kreirano")
        .range(a, b),
    ),
    sb.from("ciljevi_makroa").select("*").eq("klijent_id", klijentId).order("vrijedi_od", { ascending: false }),
    sb.from("mjerenja").select("*").eq("klijent_id", klijentId).order("datum"),
    sveStranice<Red>((a, b) =>
      sb
        .from("treninzi")
        .select("datum, naziv, zavrsen, iz_kalendara, trening_vjezbe(count), odradjene_serije(redni_broj, ponavljanja, kg, vjezba_id, vjezba:vjezbe(naziv))")
        .eq("klijent_id", klijentId)
        .gte("datum", od)
        .lte("datum", doDana)
        .order("datum")
        .range(a, b),
    ),
    sb
      .from("dodjele_planova")
      .select("od_datuma, do_datuma, plan:planovi(naziv, ciklus_tjedana, pocetak, plan_dani(tjedan, dan_u_tjednu))")
      .eq("klijent_id", klijentId)
      .order("od_datuma"),
  ]);
  for (const r of [ciljeviR, mjerenjaR, dodjeleR]) if (r.error) throw new Error(r.error.message);

  const obroci = obrociRedovi.map(uObrok);
  const ciljevi = (ciljeviR.data ?? []).map(uCilj);
  const svaMjerenja = (mjerenjaR.data ?? []).map(uMjerenje);

  // Zbroj po danu
  const poDanu = new Map<string, DanPrehrane>();
  for (const o of obroci) {
    const d =
      poDanu.get(o.datum) ??
      ({ datum: o.datum, kcal: 0, proteini: 0, ugljikohidrati: 0, masti: 0, cilj: ciljZaDan(ciljevi, o.datum) } as DanPrehrane);
    d.kcal += o.kcal;
    d.proteini += o.proteini;
    d.ugljikohidrati += o.ugljikohidrati;
    d.masti += o.masti;
    poDanu.set(o.datum, d);
  }

  const treninzi: TreningIzvoza[] = treninziR.map((t) => ({
    datum: String(t.datum),
    naziv: String(t.naziv ?? ""),
    zavrsen: Boolean(t.zavrsen),
    serije: ((t.odradjene_serije as Red[] | null) ?? [])
      .map((s) => {
        const v = (Array.isArray(s.vjezba) ? s.vjezba[0] : s.vjezba) as { naziv?: string } | null;
        return {
          vjezba: String(v?.naziv ?? "Vježba"),
          vjezbaId: String(s.vjezba_id),
          redni: Number(s.redni_broj),
          ponavljanja: Number(s.ponavljanja),
          kg: Number(s.kg),
        };
      })
      .sort((a, b) => a.vjezba.localeCompare(b.vjezba, "hr") || a.redni - b.redni),
  }));

  // Pridržavanje (isto kao na kartici Napredak)
  type DodjelaR = { od_datuma: string; do_datuma: string | null; plan: unknown };
  const dodjele = ((dodjeleR.data as DodjelaR[] | null) ?? []).map(uDodjeluZaPridrzavanje);
  // treninzi koje je trener složio u kalendaru (klijenti uživo)
  const izKalendara = new Set(
    treninziR
      .filter((t) => Boolean(t.iz_kalendara) && Number((t.trening_vjezbe as { count: number }[] | null)?.[0]?.count ?? 0) > 0)
      .map((t) => String(t.datum)),
  );
  const danaURazdoblju = Math.max(0, brojDana(od, doDana));
  let planiranih = 0;
  for (let i = 0; i < danaURazdoblju; i++) {
    const d = dodajDane(od, i);
    if (izKalendara.has(d) || dodjele.some((dj) => jePlaniranTrening(dj, d))) planiranih++;
  }
  const odradenih = new Set(treninzi.filter((t) => t.zavrsen || t.serije.length > 0).map((t) => t.datum)).size;

  return {
    klijent: {
      ime: String(profil.ime || profil.email),
      email: String(profil.email ?? ""),
      nacin: profil.nacin === "online" ? "Online" : "Uživo",
      kreirano: String(profil.kreirano),
      ...uOsobnePodatke(profil),
    },
    od,
    doDana,
    sveVrijeme: dana === null,
    praceneVjezbe: praceneVjezbe?.length ? praceneVjezbe : null,
    plan: dodjele.find((d) => d.do === null)?.naziv ?? null,
    obroci,
    dani: [...poDanu.values()],
    ciljevi,
    mjerenja: svaMjerenja.filter((m) => m.datum >= od && m.datum <= doDana),
    svaMjerenja,
    treninzi,
    pridrzavanje: {
      danaURazdoblju,
      danaSPrehranom: poDanu.size,
      planiranihTreninga: planiranih,
      odradenihTreninga: odradenih,
    },
  };
}

/** "Ana Kovačević" -> "Ana_Kovacevic" (za naziv datoteke) */
export function imeZaDatoteku(ime: string) {
  return (
    ime
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "klijent"
  );
}
