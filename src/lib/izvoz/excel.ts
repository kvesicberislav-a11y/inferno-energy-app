// Excel (.xlsx) izvoz podataka klijenta – generira se u pregledniku.
import { formatDatum, puniDatum } from "@/lib/datum";
import {
  MJERE,
  dob,
  izracunajBmi,
  postotakMasti,
  zadnjeVrijednosti,
  type Mjerenje,
} from "@/lib/tijelo";
import type { PodaciIzvoza } from "./podaci";

type Celija = string | number | Date | null | { value: string | number | Date | null; [k: string]: unknown };
type Redak = Celija[];

const ZAGLAVLJE = { fontWeight: "bold", backgroundColor: "#F97316", textColor: "#FFFFFF" } as const;

function naslovi(...oznake: string[]): Redak {
  return oznake.map((o) => ({ value: o, ...ZAGLAVLJE }));
}

function datum(d: string): Date {
  const [g, m, dan] = d.split("-").map(Number);
  return new Date(Date.UTC(g, m - 1, dan));
}

function broj(n: number | null | undefined, decimala = 1): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = Math.pow(10, decimala);
  return Math.round(n * f) / f;
}

function izracuniMjerenja(m: Mjerenje, sva: Mjerenje[], p: PodaciIzvoza) {
  // za BMI i % masti koristimo zadnje poznate vrijednosti do tog dana
  const z = zadnjeVrijednosti(sva.filter((x) => x.datum <= m.datum));
  const tezina = z.tezina_kg?.vrijednost ?? null;
  return {
    bmi: izracunajBmi(tezina, p.klijent.visina_cm),
    masti: postotakMasti(
      p.klijent.spol,
      p.klijent.visina_cm,
      z.vrat_cm?.vrijednost ?? null,
      z.struk_cm?.vrijednost ?? null,
      z.bokovi_cm?.vrijednost ?? null,
    ),
  };
}

export async function napraviExcel(p: PodaciIzvoza): Promise<Blob> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");

  const cilj = p.ciljevi[0] ?? null;
  const zadnje = zadnjeVrijednosti(p.svaMjerenja);
  const tezina = zadnje.tezina_kg?.vrijednost ?? null;
  const godine = dob(p.klijent.godina_rodenja, p.doDana);

  // 1) Sažetak
  const sazetak: Redak[] = [
    [{ value: "INFERNO ENERGY – podaci klijenta", fontWeight: "bold", fontSize: 14 }, null],
    [null, null],
    ["Klijent", p.klijent.ime],
    ["E-mail", p.klijent.email],
    ["Način rada", p.klijent.nacin],
    ["Klijent od", formatDatum(p.klijent.kreirano)],
    ["Visina (cm)", broj(p.klijent.visina_cm)],
    ["Spol", p.klijent.spol === "m" ? "muški" : p.klijent.spol === "z" ? "ženski" : null],
    ["Dob", godine],
    ["Plan treninga", p.plan ?? "—"],
    [null, null],
    ["Razdoblje", `${puniDatum(p.od)} – ${puniDatum(p.doDana)}${p.sveVrijeme ? " (cijelo vrijeme)" : ""}`],
    ["Izvezeno", puniDatum(p.doDana)],
    [null, null],
    [{ value: "Trenutni dnevni cilj", fontWeight: "bold" }, null],
    ["Kalorije (kcal)", cilj?.kcal ?? null],
    ["Proteini (g)", broj(cilj?.proteini)],
    ["Ugljikohidrati (g)", broj(cilj?.ugljikohidrati)],
    ["Masti (g)", broj(cilj?.masti)],
    [null, null],
    [{ value: "Trenutno stanje", fontWeight: "bold" }, null],
    ["Težina (kg)", broj(tezina)],
    ["BMI", broj(izracunajBmi(tezina, p.klijent.visina_cm))],
    [
      "Tjelesna mast (%)",
      broj(
        postotakMasti(
          p.klijent.spol,
          p.klijent.visina_cm,
          zadnje.vrat_cm?.vrijednost ?? null,
          zadnje.struk_cm?.vrijednost ?? null,
          zadnje.bokovi_cm?.vrijednost ?? null,
        ),
      ),
    ],
    [null, null],
    [{ value: "Pridržavanje u razdoblju", fontWeight: "bold" }, null],
    ["Dana s unosom prehrane", `${p.pridrzavanje.danaSPrehranom} od ${p.pridrzavanje.danaURazdoblju}`],
    ["Odrađeni treninzi", `${p.pridrzavanje.odradenihTreninga} od ${p.pridrzavanje.planiranihTreninga} planiranih`],
  ];

  // 2) Prehrana po danima
  const prehrana: Redak[] = [
    naslovi("Datum", "kcal", "Proteini (g)", "UH (g)", "Masti (g)", "Cilj kcal", "Cilj P", "Cilj UH", "Cilj M"),
    ...p.dani.map((d) => [
      datum(d.datum),
      broj(d.kcal, 0),
      broj(d.proteini),
      broj(d.ugljikohidrati),
      broj(d.masti),
      d.cilj?.kcal ?? null,
      broj(d.cilj?.proteini),
      broj(d.cilj?.ugljikohidrati),
      broj(d.cilj?.masti),
    ]),
  ];

  // 3) Obroci
  const obroci: Redak[] = [
    naslovi("Datum", "Obrok", "Proteini (g)", "UH (g)", "Masti (g)", "kcal"),
    ...p.obroci.map((o) => [datum(o.datum), o.naziv, broj(o.proteini), broj(o.ugljikohidrati), broj(o.masti), broj(o.kcal, 0)]),
  ];

  // 4) Mjerenja
  const mjerenja: Redak[] = [
    naslovi("Datum", ...MJERE.map((m) => `${m.oznaka} (${m.jedinica})`), "BMI", "Mast (%)"),
    ...p.mjerenja.map((m) => {
      const iz = izracuniMjerenja(m, p.svaMjerenja, p);
      return [datum(m.datum), ...MJERE.map((mj) => broj(m[mj.kljuc])), broj(iz.bmi), broj(iz.masti)];
    }),
  ];

  // 5) Treninzi (jedna serija = jedan red)
  const treninzi: Redak[] = [
    naslovi("Datum", "Trening", "Završen", "Vježba", "Serija", "Ponavljanja", "Kg", "Volumen (kg)"),
    ...p.treninzi.flatMap((t) =>
      t.serije.length
        ? t.serije.map((s) => [
            datum(t.datum),
            t.naziv,
            t.zavrsen ? "da" : "ne",
            s.vjezba,
            s.redni,
            s.ponavljanja,
            broj(s.kg),
            broj(s.kg * s.ponavljanja, 0),
          ])
        : [[datum(t.datum), t.naziv, t.zavrsen ? "da" : "ne", null, null, null, null, null]],
    ),
  ];

  // 6) Povijest ciljeva
  const ciljevi: Redak[] = [
    naslovi("Vrijedi od", "kcal", "Proteini (g)", "UH (g)", "Masti (g)"),
    ...[...p.ciljevi]
      .reverse()
      .map((c) => [datum(c.vrijedi_od), c.kcal, broj(c.proteini), broj(c.ugljikohidrati), broj(c.masti)]),
  ];

  const sir = (...w: number[]) => w.map((width) => ({ width }));
  const list = (sheet: string, data: Redak[], columns: { width: number }[]) => ({
    sheet,
    data: data as never,
    columns,
    dateFormat: "dd.mm.yyyy",
    stickyRowsCount: sheet === "Sažetak" ? 0 : 1,
  });

  return writeExcelFile(
    [
      list("Sažetak", sazetak, sir(26, 40)),
      list("Prehrana po danima", prehrana, sir(12, 9, 12, 9, 10, 10, 8, 8, 8)),
      list("Obroci", obroci, sir(12, 28, 12, 9, 10, 8)),
      list("Mjerenja", mjerenja, sir(12, 12, 10, 10, 11, 10, 10, 10, 8, 9)),
      list("Treninzi", treninzi, sir(12, 18, 9, 28, 8, 12, 8, 13)),
      list("Ciljevi", ciljevi, sir(12, 8, 12, 9, 10)),
    ] as never,
    { fontFamily: "Calibri", fontSize: 11 } as never,
  ).toBlob();
}
