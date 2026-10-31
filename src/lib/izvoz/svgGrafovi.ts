// Jednostavni grafovi kao SVG tekst za PDF (svijetla pozadina, fiksne boje).
import { kompaktno, lijepeOznake } from "@/components/grafovi/osi";

const NARANCASTA = "#f97316";
const MREZA = "#e4e4e7";
const TEKST = "#52525b";
const CILJ = "#71717a";

type Tocka = { oznaka: string; v: number; cilj?: number | null };

function esc(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const S = 515;
const V = 170;
const P = { l: 40, r: 10, t: 10, b: 22 };
const SIR = S - P.l - P.r;
const VIS = V - P.t - P.b;

function osY(oznake: number[], y: (v: number) => number, format: (n: number) => string) {
  return oznake
    .map(
      (o) =>
        `<line x1="${P.l}" x2="${S - P.r}" y1="${y(o)}" y2="${y(o)}" stroke="${MREZA}" stroke-width="0.8"/>` +
        `<text x="${P.l - 5}" y="${y(o) + 3}" font-size="8" fill="${TEKST}" text-anchor="end" font-family="Roboto">${esc(format(o))}</text>`,
    )
    .join("");
}

function osX(tocke: Tocka[], x: (i: number) => number, visina = V) {
  if (!tocke.length) return "";
  const idx = tocke.length <= 2 ? tocke.map((_, i) => i) : [0, Math.floor((tocke.length - 1) / 2), tocke.length - 1];
  return idx
    .map((i, j) => {
      const sidro = idx.length > 1 && j === 0 ? "start" : idx.length > 1 && j === idx.length - 1 ? "end" : "middle";
      return `<text x="${x(i)}" y="${visina - 6}" font-size="8" fill="${TEKST}" text-anchor="${sidro}" font-family="Roboto">${esc(tocke[i].oznaka)}</text>`;
    })
    .join("");
}

/** Linijski graf (npr. težina) – os ne kreće od nule. */
export function svgLinija(tocke: Tocka[], format: (n: number) => string, visina = V): string {
  const vis = visina - P.t - P.b;
  const vr = tocke.map((t) => t.v);
  const oznake = lijepeOznake(Math.min(...vr), Math.max(...vr), 4);
  const y0 = oznake[0];
  const y1 = oznake[oznake.length - 1];
  const x = (i: number) => (tocke.length === 1 ? P.l + SIR / 2 : P.l + (i * SIR) / (tocke.length - 1));
  const y = (v: number) => P.t + (1 - (v - y0) / (y1 - y0 || 1)) * vis;
  const put = tocke.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t.v).toFixed(1)}`).join(" ");
  const zadnja = tocke[tocke.length - 1];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${visina}" viewBox="0 0 ${S} ${visina}">
${osY(oznake, y, format)}
<path d="${put} L${x(tocke.length - 1)},${P.t + vis} L${x(0)},${P.t + vis} Z" fill="${NARANCASTA}" fill-opacity="0.1"/>
<path d="${put}" fill="none" stroke="${NARANCASTA}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="${x(tocke.length - 1)}" cy="${y(zadnja.v)}" r="3.5" fill="${NARANCASTA}" stroke="#ffffff" stroke-width="1.5"/>
${osX(tocke, x, visina)}
</svg>`;
}

/** Stupčasti graf od nule, s neobaveznom (stepenastom) linijom cilja. */
export function svgStupci(tocke: Tocka[]): string {
  const n = tocke.length;
  const najveca = Math.max(1, ...tocke.map((t) => Math.max(t.v, t.cilj ?? 0)));
  const oznake = lijepeOznake(0, najveca, 4);
  const y1 = oznake[oznake.length - 1];
  const traka = SIR / Math.max(1, n);
  const sirina = Math.max(1.2, Math.min(18, traka * 0.7));
  const xs = (i: number) => P.l + traka * i + traka / 2;
  const y = (v: number) => P.t + (1 - v / (y1 || 1)) * VIS;
  const dno = P.t + VIS;

  const stupci = tocke
    .map((t, i) => {
      if (t.v <= 0) return "";
      const vrh = y(t.v);
      return `<rect x="${(xs(i) - sirina / 2).toFixed(1)}" y="${vrh.toFixed(1)}" width="${sirina.toFixed(1)}" height="${(dno - vrh).toFixed(1)}" rx="${Math.min(2, sirina / 2)}" fill="${NARANCASTA}"/>`;
    })
    .join("");

  let cilj = "";
  tocke.forEach((t, i) => {
    if (!t.cilj) return;
    const l = P.l + traka * i;
    const prije = i > 0 ? tocke[i - 1].cilj : null;
    cilj += `${prije ? " L" : " M"}${l.toFixed(1)},${y(t.cilj).toFixed(1)} L${(l + traka).toFixed(1)},${y(t.cilj).toFixed(1)}`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${V}" viewBox="0 0 ${S} ${V}">
${osY(oznake, y, kompaktno)}
${stupci}
${cilj ? `<path d="${cilj}" fill="none" stroke="${CILJ}" stroke-width="1.2"/>` : ""}
${osX(tocke, xs)}
</svg>`;
}
