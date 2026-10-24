// PDF izvještaj o napretku klijenta – generira se u pregledniku (pdfmake, font Roboto s hrvatskim slovima).
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { danMjesec, dodajDane, ponedjeljak, puniDatum } from "@/lib/datum";
import { formatG, formatKcal } from "@/lib/makroi";
import {
  MJERE,
  bazalniMetabolizam,
  dob,
  format1,
  izracunajBmi,
  kategorijaBmi,
  postotakMasti,
  zadnjeVrijednosti,
  type Mjerenje,
} from "@/lib/tijelo";
import type { PodaciIzvoza } from "./podaci";
import { svgLinija, svgStupci } from "./svgGrafovi";

const NARANCASTA = "#f97316";
const SIVA = "#71717a";

type PdfMake = typeof import("pdfmake/build/pdfmake");

async function ucitajPdfMake(): Promise<PdfMake> {
  const modul = await import("pdfmake/build/pdfmake");
  const pdfMake = ((modul as unknown as { default?: PdfMake }).default ?? modul) as PdfMake;
  const fontovi = await import("pdfmake/build/vfs_fonts");
  pdfMake.addVirtualFileSystem(
    ((fontovi as unknown as { default?: unknown }).default ?? fontovi) as Parameters<PdfMake["addVirtualFileSystem"]>[0],
  );
  return pdfMake;
}

function naslov(tekst: string): Content {
  return { text: tekst, fontSize: 14, bold: true, color: NARANCASTA, margin: [0, 16, 0, 6] };
}

function predznak(n: number) {
  if (Math.abs(n) < 0.05) return "±0";
  return `${n > 0 ? "+" : "−"}${format1(Math.abs(n))}`;
}

function stanjeDo(sva: Mjerenje[], datum: string) {
  return zadnjeVrijednosti(sva.filter((m) => m.datum <= datum));
}

export async function napraviPdf(p: PodaciIzvoza): Promise<Blob> {
  const pdfMake = await ucitajPdfMake();

  const { klijent } = p;
  const cilj = p.ciljevi[0] ?? null;
  const godine = dob(klijent.godina_rodenja, p.doDana);

  // ---------- Tijelo: početak razdoblja vs sada ----------
  const imaPrije = p.svaMjerenja.some((m) => m.datum <= p.od);
  const pocetniDatum = imaPrije ? p.od : (p.mjerenja[0]?.datum ?? null);
  const pocetak = pocetniDatum ? stanjeDo(p.svaMjerenja, pocetniDatum) : null;
  const sada = stanjeDo(p.svaMjerenja, p.doDana);

  const izvedeno = (z: ReturnType<typeof zadnjeVrijednosti> | null) => {
    if (!z) return { bmi: null, masti: null, nemasna: null };
    const kg = z.tezina_kg?.vrijednost ?? null;
    const masti = postotakMasti(
      klijent.spol,
      klijent.visina_cm,
      z.vrat_cm?.vrijednost ?? null,
      z.struk_cm?.vrijednost ?? null,
      z.bokovi_cm?.vrijednost ?? null,
    );
    return {
      bmi: izracunajBmi(kg, klijent.visina_cm),
      masti,
      nemasna: masti !== null && kg !== null ? kg * (1 - masti / 100) : null,
    };
  };
  const izP = izvedeno(pocetak);
  const izS = izvedeno(sada);

  const redTijela = (oznaka: string, a: number | null, b: number | null, jedinica: string): TableCell[] => [
    oznaka,
    a !== null ? `${format1(a)} ${jedinica}` : "—",
    b !== null ? `${format1(b)} ${jedinica}` : "—",
    a !== null && b !== null ? { text: `${predznak(b - a)} ${jedinica}`, bold: true } : "—",
  ];

  const tijeloRedovi: TableCell[][] = [
    [
      { text: "Mjera", bold: true },
      { text: pocetniDatum ? `Početak (${danMjesec(pocetniDatum)})` : "Početak", bold: true },
      { text: "Sada", bold: true },
      { text: "Promjena", bold: true },
    ],
    ...MJERE.filter((m) => sada[m.kljuc] !== null).map((m) =>
      redTijela(m.oznaka, pocetak?.[m.kljuc]?.vrijednost ?? null, sada[m.kljuc]?.vrijednost ?? null, m.jedinica),
    ),
    ...(izS.bmi !== null ? [redTijela("BMI", izP.bmi, izS.bmi, "")] : []),
    ...(izS.masti !== null ? [redTijela("Tjelesna mast", izP.masti, izS.masti, "%")] : []),
    ...(izS.nemasna !== null ? [redTijela("Nemasna masa", izP.nemasna, izS.nemasna, "kg")] : []),
  ];

  const tezine = p.mjerenja
    .filter((m) => m.tezina_kg !== null)
    .map((m) => ({ oznaka: danMjesec(m.datum), v: m.tezina_kg! }));

  const kgSada = sada.tezina_kg?.vrijednost ?? null;
  const bmr = bazalniMetabolizam(klijent.spol, kgSada, klijent.visina_cm, godine);

  // ---------- Prehrana ----------
  const pr = p.pridrzavanje;
  const postoPrehrane = pr.danaURazdoblju ? Math.round((pr.danaSPrehranom / pr.danaURazdoblju) * 100) : null;
  const prosjek = (k: "kcal" | "proteini" | "ugljikohidrati" | "masti") =>
    p.dani.length ? p.dani.reduce((s, d) => s + d[k], 0) / p.dani.length : null;
  const makroRedovi: TableCell[][] = [
    [
      { text: "", bold: true },
      { text: "Prosjek po danu", bold: true },
      { text: "Cilj", bold: true },
      { text: "% cilja", bold: true },
    ],
    ...(
      [
        ["Kalorije", "kcal", "kcal", (n: number) => formatKcal(n)],
        ["Proteini", "proteini", "g", (n: number) => formatG(Math.round(n))],
        ["Ugljikohidrati", "ugljikohidrati", "g", (n: number) => formatG(Math.round(n))],
        ["Masti", "masti", "g", (n: number) => formatG(Math.round(n))],
      ] as const
    ).map(([oznaka, k, jed, f]) => {
      const pr = prosjek(k);
      const c = cilj ? cilj[k] : null;
      return [
        oznaka,
        pr !== null ? `${f(pr)} ${jed}` : "—",
        c ? `${f(c)} ${jed}` : "—",
        pr !== null && c ? `${Math.round((pr / c) * 100)} %` : "—",
      ];
    }),
  ];

  const danaRazdoblja = pr.danaURazdoblju;
  const poDanu = new Map(p.dani.map((d) => [d.datum, d]));
  const tocKcal =
    danaRazdoblja <= 60
      ? Array.from({ length: danaRazdoblja }, (_, i) => {
          const d = dodajDane(p.od, i);
          const dan = poDanu.get(d);
          const c = p.ciljevi.find((x) => x.vrijedi_od <= d);
          return { oznaka: danMjesec(d), v: dan?.kcal ?? 0, cilj: c?.kcal ?? null };
        })
      : (() => {
          const rez: { oznaka: string; v: number; cilj: number | null }[] = [];
          for (let t = ponedjeljak(p.od); t <= p.doDana; t = dodajDane(t, 7)) {
            const dani = p.dani.filter((d) => d.datum >= t && d.datum <= dodajDane(t, 6));
            const c = p.ciljevi.find((x) => x.vrijedi_od <= dodajDane(t, 6));
            rez.push({
              oznaka: danMjesec(t),
              v: dani.length ? dani.reduce((s, d) => s + d.kcal, 0) / dani.length : 0,
              cilj: c?.kcal ?? null,
            });
          }
          return rez;
        })();

  // ---------- Treninzi ----------
  const postoTreninga = pr.planiranihTreninga
    ? Math.min(100, Math.round((pr.odradenihTreninga / pr.planiranihTreninga) * 100))
    : null;
  const sveSerije = p.treninzi.flatMap((t) => t.serije.map((s) => ({ ...s, datum: t.datum })));
  const ukupniVolumen = sveSerije.reduce((s, x) => s + x.kg * x.ponavljanja, 0);

  const tjedniVolumen: { oznaka: string; v: number }[] = [];
  for (let t = ponedjeljak(p.od); t <= p.doDana; t = dodajDane(t, 7)) {
    const v = sveSerije
      .filter((s) => s.datum >= t && s.datum <= dodajDane(t, 6))
      .reduce((a, s) => a + s.kg * s.ponavljanja, 0);
    tjedniVolumen.push({ oznaka: danMjesec(t), v });
  }

  const poVjezbi = new Map<string, typeof sveSerije>();
  for (const s of sveSerije) poVjezbi.set(s.vjezba, [...(poVjezbi.get(s.vjezba) ?? []), s]);
  const najbolje = [...poVjezbi.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([vjezba, serije]) => {
      const max = serije.reduce((m, s) => (s.kg > m.kg || (s.kg === m.kg && s.ponavljanja > m.ponavljanja) ? s : m));
      return [vjezba, max.kg > 0 ? `${formatG(max.kg)} kg × ${max.ponavljanja}` : `${max.ponavljanja} pon.`, puniDatum(max.datum), String(serije.length)];
    });

  // ---------- Dokument ----------
  const sadrzaj: Content[] = [
    {
      columns: [
        {
          text: [
            { text: "INFERNO", color: NARANCASTA, bold: true },
            { text: " ENERGY", bold: true },
          ],
          fontSize: 18,
        },
        { text: "Izvještaj o napretku", alignment: "right", color: SIVA, margin: [0, 4, 0, 0] },
      ],
    },
    { text: klijent.ime, fontSize: 22, bold: true, margin: [0, 14, 0, 2] },
    {
      text: `Razdoblje: ${puniDatum(p.od)} – ${puniDatum(p.doDana)}${p.sveVrijeme ? " (cijelo vrijeme)" : ""}`,
      color: SIVA,
    },
    { canvas: [{ type: "line", x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 1, lineColor: "#e4e4e7" }] },

    naslov("Osobni podaci"),
    {
      layout: "noBorders",
      table: {
        widths: [110, "*", 110, "*"],
        body: [
          [
            { text: "Visina", color: SIVA },
            klijent.visina_cm ? `${format1(klijent.visina_cm)} cm` : "—",
            { text: "Način rada", color: SIVA },
            klijent.nacin,
          ],
          [
            { text: "Spol", color: SIVA },
            klijent.spol === "m" ? "muški" : klijent.spol === "z" ? "ženski" : "—",
            { text: "Plan treninga", color: SIVA },
            p.plan ?? "—",
          ],
          [
            { text: "Dob", color: SIVA },
            godine !== null ? `${godine} god.` : "—",
            { text: "Bazalni metabolizam", color: SIVA },
            bmr !== null ? `${formatKcal(bmr)} kcal` : "—",
          ],
          [
            { text: "Dnevni cilj", color: SIVA },
            {
              text: cilj
                ? `${formatKcal(cilj.kcal)} kcal · P ${formatG(cilj.proteini)} · UH ${formatG(cilj.ugljikohidrati)} · M ${formatG(cilj.masti)} g`
                : "—",
              colSpan: 3,
            },
            "",
            "",
          ],
        ],
      },
    },

    // Svaki dio drži se na jednoj stranici (bez prijeloma usred tablice)
    { unbreakable: true, stack: [
    naslov("Tijelo"),
    tijeloRedovi.length > 1
      ? {
          layout: "lightHorizontalLines",
          table: { headerRows: 1, widths: ["*", "auto", "auto", "auto"], body: tijeloRedovi },
        }
      : { text: "Nema unesenih mjera.", color: SIVA },
    ...(izS.bmi !== null
      ? [{ text: `BMI kategorija: ${kategorijaBmi(izS.bmi).oznaka}`, color: SIVA, fontSize: 9, margin: [0, 4, 0, 0] } as Content]
      : []),
    {
      text: "Izračuni (BMI, % masti po formuli američke mornarice, bazalni metabolizam) su procjene za praćenje napretka, a ne medicinska dijagnoza.",
      fontSize: 7.5,
      color: SIVA,
      margin: [0, 2, 0, 0],
    },
    ...(tezine.length >= 2
      ? [
          { text: "Težina kroz vrijeme (kg)", bold: true, margin: [0, 12, 0, 4] } as Content,
          { svg: svgLinija(tezine, format1), width: 515 } as Content,
        ]
      : []),

    ] } as Content,

    { unbreakable: true, stack: [
    naslov("Prehrana"),
    {
      text: [
        "Unos prehrane: ",
        { text: `${pr.danaSPrehranom} od ${pr.danaURazdoblju} dana`, bold: true },
        postoPrehrane !== null ? ` (${postoPrehrane} %)` : "",
      ],
      margin: [0, 0, 0, 6],
    },
    p.dani.length
      ? {
          layout: "lightHorizontalLines",
          table: { headerRows: 1, widths: ["*", "auto", "auto", "auto"], body: makroRedovi },
        }
      : { text: "U ovom razdoblju nema unosa prehrane.", color: SIVA },
    ...(p.dani.length
      ? [
          {
            text: danaRazdoblja <= 60 ? "Kalorije po danu (linija = cilj)" : "Kalorije – tjedni prosjek (linija = cilj)",
            bold: true,
            margin: [0, 12, 0, 4],
          } as Content,
          { svg: svgStupci(tocKcal), width: 515 } as Content,
        ]
      : []),

    ] } as Content,

    { unbreakable: true, stack: [
    naslov("Treninzi"),
    {
      text: [
        "Odrađeno treninga: ",
        { text: String(pr.odradenihTreninga), bold: true },
        pr.planiranihTreninga ? ` od ${pr.planiranihTreninga} planiranih (${postoTreninga} %)` : "",
        "   ·   Ukupni volumen: ",
        { text: `${Math.round(ukupniVolumen).toLocaleString("hr-HR")} kg`, bold: true },
        "   ·   Serija: ",
        { text: String(sveSerije.length), bold: true },
      ],
      margin: [0, 0, 0, 6],
    },
    ...(sveSerije.length
      ? [
          { text: "Volumen po tjednu (kg × ponavljanja)", bold: true, margin: [0, 6, 0, 4] } as Content,
          { svg: svgStupci(tjedniVolumen), width: 515 } as Content,
          { text: "Najbolje serije po vježbi", bold: true, margin: [0, 12, 0, 4] } as Content,
          {
            layout: "lightHorizontalLines",
            table: {
              headerRows: 1,
              widths: ["*", "auto", "auto", "auto"],
              body: [
                [
                  { text: "Vježba", bold: true },
                  { text: "Najbolja serija", bold: true },
                  { text: "Datum", bold: true },
                  { text: "Serija", bold: true },
                ],
                ...najbolje,
              ],
            },
          } as Content,
        ]
      : [{ text: "U ovom razdoblju nema upisanih serija.", color: SIVA } as Content]),

    ] } as Content,
  ];

  const def: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    info: { title: `INFERNO ENERGY – ${klijent.ime}`, author: "INFERNO ENERGY" },
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#18181b", lineHeight: 1.2 },
    content: sadrzaj,
    footer: (trenutna, ukupno) => ({
      columns: [
        { text: `INFERNO ENERGY · izrađeno ${puniDatum(p.doDana)}`, color: SIVA, fontSize: 8 },
        { text: `${trenutna} / ${ukupno}`, alignment: "right", color: SIVA, fontSize: 8 },
      ],
      margin: [40, 16, 40, 0],
    }),
  };

  return pdfMake.createPdf(def).getBlob();
}
