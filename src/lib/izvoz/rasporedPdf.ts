// PDF raspored tjedna (svi klijenti ili jedan) – za klijente koji nemaju aplikaciju ili se njome ne služe.
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { bojaKlijenta } from "@/lib/boje";
import { danMjesec, danasZagreb, dodajDane, puniDatum, tjedanUGodini } from "@/lib/datum";
import type { Termin } from "@/lib/raspored";
import { DANI_KRATKO } from "@/lib/treninzi";
import { ucitajPdfMake } from "./pdfMake";

const NARANCASTA = "#f97316";
const SIVA = "#71717a";
const RUB = "#d4d4d8";

/** "rgb(249, 115, 22)" -> "#f97316" (pdfmake ne razumije rgb()). */
function uHex(boja: string) {
  const m = boja.match(/\d+/g);
  if (!boja.startsWith("rgb") || !m) return boja;
  return `#${m
    .slice(0, 3)
    .map((x) => Number(x).toString(16).padStart(2, "0"))
    .join("")}`;
}

const sat = (vrijeme: string) => Number(vrijeme.slice(0, 2));

export async function napraviPdfRasporeda({
  pon,
  termini,
  imena,
  boje,
  zaKoga,
}: {
  /** ponedjeljak tjedna */
  pon: string;
  termini: Termin[];
  imena: Record<string, string>;
  boje: Record<string, number | null>;
  /** ime klijenta kad je raspored samo za jednu osobu */
  zaKoga?: string;
}): Promise<Blob> {
  const pdfMake = await ucitajPdfMake();
  const { tjedan, godina } = tjedanUGodini(pon);
  const dani = Array.from({ length: 7 }, (_, i) => dodajDane(pon, i));
  const aktivni = termini.filter((t) => !t.otkazan).sort((a, b) => a.vrijeme.localeCompare(b.vrijeme));

  // termin: vrijeme + ime, u boji klijenta (kao u kalendaru)
  const oznaka = (t: Termin): Content => {
    const b = bojaKlijenta(boje[t.klijentId]);
    return {
      table: {
        widths: ["*"],
        body: [
          [
            {
              text: [{ text: `${t.vrijeme} `, bold: true }, imena[t.klijentId] ?? "Klijent"],
              fillColor: uHex(b.pozadina),
              color: b.tekst === "#fff" ? "#ffffff" : b.tekst,
              fontSize: 8,
              margin: [3, 2, 3, 2],
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 0, 0, 2],
    };
  };

  const zaglavlje: TableCell[] = [
    { text: "" },
    ...dani.map(
      (d, i): TableCell => ({
        text: `${DANI_KRATKO[i]} ${danMjesec(d)}`,
        bold: true,
        alignment: "center",
        fillColor: "#f4f4f5",
        margin: [0, 2, 0, 2],
      }),
    ),
  ];
  const redovi: TableCell[][] = [];
  if (aktivni.length) {
    const sati = aktivni.map((t) => sat(t.vrijeme));
    for (let h = Math.min(...sati); h <= Math.max(...sati); h++) {
      redovi.push([
        { text: `${h}:00`, color: SIVA, fontSize: 8, alignment: "right", margin: [0, 2, 2, 0] },
        ...dani.map((d): TableCell => {
          const u = aktivni.filter((t) => t.datum === d && sat(t.vrijeme) === h);
          return u.length ? { stack: u.map(oznaka) } : { text: "" };
        }),
      ]);
    }
  }

  const sadrzaj: Content[] = [
    { text: "INFERNO ENERGY", color: NARANCASTA, bold: true, fontSize: 10 },
    { text: `Raspored · ${tjedan}. tjedan ${godina}`, fontSize: 18, bold: true, margin: [0, 2, 0, 0] },
    {
      text: `${danMjesec(pon)} – ${danMjesec(dodajDane(pon, 6))} ${godina}.${zaKoga ? ` · ${zaKoga}` : ""}`,
      color: SIVA,
      margin: [0, 0, 0, 10],
    },
    aktivni.length
      ? {
          table: { headerRows: 1, widths: [30, "*", "*", "*", "*", "*", "*", "*"], body: [zaglavlje, ...redovi], dontBreakRows: true },
          layout: {
            hLineColor: () => RUB,
            vLineColor: () => RUB,
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            paddingLeft: () => 2,
            paddingRight: () => 2,
            paddingTop: () => 2,
            paddingBottom: () => 1,
          },
        }
      : { text: "Ovaj tjedan nema termina.", color: SIVA },
  ];

  const def: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 28, 28, 40],
    info: { title: `INFERNO ENERGY – raspored ${tjedan}. tjedan ${godina}`, author: "INFERNO ENERGY" },
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#18181b", lineHeight: 1.15 },
    content: sadrzaj,
    footer: (trenutna, ukupno) => ({
      columns: [
        { text: `INFERNO ENERGY · izrađeno ${puniDatum(danasZagreb())}`, color: SIVA, fontSize: 8 },
        { text: `${trenutna} / ${ukupno}`, alignment: "right", color: SIVA, fontSize: 8 },
      ],
      margin: [28, 14, 28, 0],
    }),
  };

  return pdfMake.createPdf(def).getBlob();
}
