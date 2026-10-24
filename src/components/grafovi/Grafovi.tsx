"use client";

import { useState, type PointerEvent, type ReactNode } from "react";
import { BOJE, kompaktno, lijepeOznake } from "./osi";

export type Tocka = {
  kljuc: string;
  /** oznaka za os i opis, npr. "24. 10." */
  oznaka: string;
  vrijednost: number | null;
  cilj?: number | null;
};

const S = 340; // širina u jedinicama viewBoxa
const V = 190; // visina
const P = { l: 44, r: 14, t: 16, b: 26 };
const SIR = S - P.l - P.r;
const VIS = V - P.t - P.b;

function najbliziIndeks(e: PointerEvent<SVGSVGElement>, broj: number, xPoz: (i: number) => number) {
  const r = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * S;
  let naj = 0;
  let razlika = Infinity;
  for (let i = 0; i < broj; i++) {
    const d = Math.abs(xPoz(i) - x);
    if (d < razlika) {
      razlika = d;
      naj = i;
    }
  }
  return naj;
}

function Oblacic({ x, children }: { x: number; children: ReactNode }) {
  const posto = Math.min(85, Math.max(15, (x / S) * 100));
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-rub bg-pozadina/95 px-3 py-1.5 text-center text-sm shadow-lg"
      style={{ left: `${posto}%` }}
    >
      {children}
    </div>
  );
}

function OsY({ oznake, y, format }: { oznake: number[]; y: (v: number) => number; format: (n: number) => string }) {
  return (
    <>
      {oznake.map((o) => (
        <g key={o}>
          <line x1={P.l} x2={S - P.r} y1={y(o)} y2={y(o)} stroke={BOJE.mreza} strokeWidth={1} />
          <text x={P.l - 6} y={y(o)} dy="0.32em" textAnchor="end" fontSize={10} fill={BOJE.tekst} className="tabular-nums">
            {format(o)}
          </text>
        </g>
      ))}
    </>
  );
}

function OsX({ tocke, x }: { tocke: Tocka[]; x: (i: number) => number }) {
  if (tocke.length === 0) return null;
  const indeksi = tocke.length <= 2 ? tocke.map((_, i) => i) : [0, Math.floor((tocke.length - 1) / 2), tocke.length - 1];
  return (
    <>
      {indeksi.map((i, j) => (
        <text
          key={i}
          x={x(i)}
          y={V - 8}
          fontSize={10}
          fill={BOJE.tekst}
          textAnchor={j === 0 && indeksi.length > 1 ? "start" : j === indeksi.length - 1 && indeksi.length > 1 ? "end" : "middle"}
        >
          {tocke[i].oznaka}
        </text>
      ))}
    </>
  );
}

/** Linijski graf (npr. težina kroz vrijeme). Os ne kreće od nule – prikazuje promjenu. */
export function LinijskiGraf({
  tocke,
  format,
  jedinica,
  opis,
}: {
  tocke: Tocka[];
  format: (n: number) => string;
  jedinica: string;
  opis: string;
}) {
  const [aktivni, setAktivni] = useState<number | null>(null);
  const t = tocke.filter((x) => x.vrijednost !== null) as (Tocka & { vrijednost: number })[];
  const vr = t.map((x) => x.vrijednost);
  const oznake = lijepeOznake(Math.min(...vr), Math.max(...vr), 4);
  const y0 = oznake[0];
  const y1 = oznake[oznake.length - 1];
  const x = (i: number) => (t.length === 1 ? P.l + SIR / 2 : P.l + (i * SIR) / (t.length - 1));
  const y = (v: number) => P.t + (1 - (v - y0) / (y1 - y0 || 1)) * VIS;
  const linija = t.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.vrijednost).toFixed(1)}`).join(" ");
  const povrsina = t.length > 1 ? `${linija} L${x(t.length - 1)},${P.t + VIS} L${x(0)},${P.t + VIS} Z` : "";
  const zadnji = t.length - 1;

  return (
    <div className="relative pt-9">
      {aktivni !== null && t[aktivni] && (
        <Oblacic x={x(aktivni)}>
          <strong className="tabular-nums">
            {format(t[aktivni].vrijednost)} {jedinica}
          </strong>
          <span className="block text-xs text-tekst-2">{t[aktivni].oznaka}</span>
        </Oblacic>
      )}
      <svg
        viewBox={`0 0 ${S} ${V}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={opis}
        onPointerMove={(e) => setAktivni(najbliziIndeks(e, t.length, x))}
        onPointerDown={(e) => setAktivni(najbliziIndeks(e, t.length, x))}
        onPointerLeave={() => setAktivni(null)}
      >
        <OsY oznake={oznake} y={y} format={format} />
        {povrsina && <path d={povrsina} fill={BOJE.serija} opacity={0.1} />}
        <path d={linija} fill="none" stroke={BOJE.serija} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {aktivni !== null && t[aktivni] && (
          <line x1={x(aktivni)} x2={x(aktivni)} y1={P.t} y2={P.t + VIS} stroke={BOJE.tekst} strokeWidth={1} />
        )}
        {t.map((p, i) =>
          i === zadnji || i === aktivni ? (
            <circle
              key={p.kljuc}
              cx={x(i)}
              cy={y(p.vrijednost)}
              r={4}
              fill={BOJE.serija}
              stroke={BOJE.povrsina}
              strokeWidth={2}
            />
          ) : null,
        )}
        <OsX tocke={t} x={x} />
      </svg>
    </div>
  );
}

/** Stupčasti graf od nule, s neobaveznom linijom cilja (stepenasto, cilj se može mijenjati). */
export function StupciGraf({
  tocke,
  format,
  jedinica,
  opis,
}: {
  tocke: Tocka[];
  format: (n: number) => string;
  jedinica: string;
  opis: string;
}) {
  const [aktivni, setAktivni] = useState<number | null>(null);
  const n = tocke.length;
  const najveca = Math.max(1, ...tocke.map((t) => Math.max(t.vrijednost ?? 0, t.cilj ?? 0)));
  const oznake = lijepeOznake(0, najveca, 4);
  const y1 = oznake[oznake.length - 1];
  const traka = SIR / Math.max(1, n);
  const sirinaStupca = Math.max(1.5, Math.min(24, traka * 0.7));
  const xSredina = (i: number) => P.l + traka * i + traka / 2;
  const y = (v: number) => P.t + (1 - v / (y1 || 1)) * VIS;
  const dno = P.t + VIS;

  // stepenasta linija cilja
  let ciljPut = "";
  tocke.forEach((t, i) => {
    if (t.cilj == null || t.cilj <= 0) return;
    const lijevo = P.l + traka * i;
    const desno = lijevo + traka;
    const prethodni = i > 0 ? tocke[i - 1].cilj : null;
    ciljPut += prethodni != null && prethodni > 0 ? ` L${lijevo.toFixed(1)},${y(t.cilj).toFixed(1)}` : ` M${lijevo.toFixed(1)},${y(t.cilj).toFixed(1)}`;
    ciljPut += ` L${desno.toFixed(1)},${y(t.cilj).toFixed(1)}`;
  });
  const zadnjiCilj = [...tocke].reverse().find((t) => t.cilj != null && t.cilj > 0)?.cilj ?? null;

  const aktivnaTocka = aktivni !== null ? tocke[aktivni] : null;

  return (
    <div className="relative pt-9">
      {aktivnaTocka && aktivni !== null && (
        <Oblacic x={xSredina(aktivni)}>
          <strong className="tabular-nums">
            {aktivnaTocka.vrijednost ? `${format(aktivnaTocka.vrijednost)} ${jedinica}` : "bez unosa"}
          </strong>
          {aktivnaTocka.cilj ? (
            <span className="block text-xs text-tekst-2 tabular-nums">
              cilj {format(aktivnaTocka.cilj)} {jedinica}
            </span>
          ) : null}
          <span className="block text-xs text-tekst-2">{aktivnaTocka.oznaka}</span>
        </Oblacic>
      )}
      <svg
        viewBox={`0 0 ${S} ${V}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={opis}
        onPointerMove={(e) => setAktivni(najbliziIndeks(e, n, xSredina))}
        onPointerDown={(e) => setAktivni(najbliziIndeks(e, n, xSredina))}
        onPointerLeave={() => setAktivni(null)}
      >
        <OsY oznake={oznake} y={y} format={kompaktno} />
        {tocke.map((t, i) => {
          const v = t.vrijednost ?? 0;
          if (v <= 0) return null;
          const vrh = y(v);
          const visina = dno - vrh;
          const r = Math.min(4, sirinaStupca / 2, visina);
          const xl = xSredina(i) - sirinaStupca / 2;
          const xd = xl + sirinaStupca;
          const put = `M${xl},${dno} V${vrh + r} Q${xl},${vrh} ${xl + r},${vrh} H${xd - r} Q${xd},${vrh} ${xd},${vrh + r} V${dno} Z`;
          return (
            <path
              key={t.kljuc}
              d={put}
              fill={BOJE.serija}
              opacity={aktivni === null || aktivni === i ? 1 : 0.55}
            />
          );
        })}
        {ciljPut && (
          <>
            <path d={ciljPut} fill="none" stroke={BOJE.cilj} strokeWidth={1.5} strokeLinejoin="round" />
            {zadnjiCilj && (
              <text x={S - P.r} y={y(zadnjiCilj) - 5} fontSize={10} textAnchor="end" fill={BOJE.tekst}>
                cilj
              </text>
            )}
          </>
        )}
        <OsX tocke={tocke} x={xSredina} />
      </svg>
    </div>
  );
}

/** Tablični prikaz istih podataka (pristupačnost, točne brojke). */
export function TablicaPodataka({
  zaglavlje,
  redovi,
}: {
  zaglavlje: string[];
  redovi: string[][];
}) {
  const [otvoreno, setOtvoreno] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOtvoreno((o) => !o)} className="text-sm font-medium text-tekst-2 underline">
        {otvoreno ? "Sakrij tablicu" : "Prikaži tablicu"}
      </button>
      {otvoreno && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-rub">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-povrsina-2 text-tekst-2">
              <tr>
                {zaglavlje.map((z) => (
                  <th key={z} className="px-3 py-2 text-left font-medium">
                    {z}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {redovi.map((r, i) => (
                <tr key={i} className="border-t border-rub">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-1.5">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
