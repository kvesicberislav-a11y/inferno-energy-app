"use client";

import { useRef, useState, type DragEvent } from "react";
import { danMjesec, dodajDane, vrijemeZagreb } from "@/lib/datum";
import { bojaKlijenta } from "@/lib/boje";
import { kljucTreninga, kratkeSkupine } from "@/lib/kalendar";
import { jePomaknut, type Termin } from "@/lib/raspored";
import { DANI_KRATKO } from "@/lib/treninzi";

const VISINA_SATA = 48; // px
const PRVI_SAT = 7;
const ZADNJI_SAT = 21; // zadnji red počinje u 20:00 i završava u 21:00

/** 495 -> "08:15" */
function uVrijeme(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Kamo je termin ispušten: na mjesto (dan + minute) ili na drugi termin (zamjena). */
type Cilj = { datum: string; min: number } | { kljuc: string };
export type CiljPremjestanja = { datum: string; vrijeme: string } | { zamjena: Termin };

function minute(vrijeme: string) {
  const [h, m] = vrijeme.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Termini jednog dana raspoređeni u stupce kad se preklapaju. */
function rasporedi(termini: Termin[]) {
  const redom = [...termini].sort((a, b) => minute(a.vrijeme) - minute(b.vrijeme));
  const rez: { t: Termin; stupac: number; stupaca: number }[] = [];
  let skupina: { t: Termin; stupac: number }[] = [];
  let krajSkupine = -1;
  const zatvori = () => {
    const stupaca = Math.max(1, ...skupina.map((x) => x.stupac + 1));
    rez.push(...skupina.map((x) => ({ ...x, stupaca })));
    skupina = [];
  };
  for (const t of redom) {
    const pocetak = minute(t.vrijeme);
    const kraj = pocetak + t.trajanje;
    if (pocetak >= krajSkupine && skupina.length) zatvori();
    // prvi stupac u kojem je prethodni termin već završio
    const zauzeti = skupina.filter((x) => minute(x.t.vrijeme) + x.t.trajanje > pocetak).map((x) => x.stupac);
    let stupac = 0;
    while (zauzeti.includes(stupac)) stupac++;
    skupina.push({ t, stupac });
    krajSkupine = Math.max(krajSkupine, kraj);
  }
  if (skupina.length) zatvori();
  return rez;
}

/**
 * Tjedna mreža termina (Pon–Ned × sati).
 * Dodir na termin otvara radnje, dodir na prazno polje dodaje novi termin.
 */
export function TjednaMreza({
  pon,
  danas,
  termini,
  imena,
  onTermin,
  onPrazno,
  oznake = {},
  istaknut,
  boje = {},
  siroko = false,
  visinaMreze,
  onPremjesti,
}: {
  pon: string;
  danas: string;
  termini: Termin[];
  imena: Record<string, string>;
  /** trening iz kalendara po terminu (ključ klijent|datum): skupine i je li završen */
  oznake?: Record<string, { skupine: string[]; zavrsen: boolean; nijeDosao?: boolean }>;
  /** filter: termini koji ne odgovaraju prikazuju se posivljeno */
  istaknut?: (t: Termin) => boolean;
  /** redni broj boje po klijentu */
  boje?: Record<string, number | null>;
  /** računalo: veća polja, puna imena i skupine */
  siroko?: boolean;
  /** puni zaslon: visina mreže u px (sati se rastegnu da stane cijeli dan) */
  visinaMreze?: number;
  /** računalo: termin se povuče mišem na drugo mjesto (ili na drugi termin = zamjena) */
  onPremjesti?: (t: Termin, cilj: CiljPremjestanja) => void;
  onTermin: (t: Termin) => void;
  onPrazno: (datum: string, vrijeme: string) => void;
}) {
  const dani = Array.from({ length: 7 }, (_, i) => dodajDane(pon, i));
  const prviSat = Math.min(PRVI_SAT, ...termini.map((t) => Math.floor(minute(t.vrijeme) / 60)));
  const zadnjiSat = Math.max(ZADNJI_SAT, ...termini.map((t) => Math.ceil((minute(t.vrijeme) + t.trajanje) / 60)));
  const sati = Array.from({ length: zadnjiSat - prviSat }, (_, i) => prviSat + i);
  const visinaSata = visinaMreze
    ? Math.max(36, Math.min(96, Math.floor(visinaMreze / sati.length)))
    : siroko
      ? 60
      : VISINA_SATA;
  const visina = sati.length * visinaSata;
  const [h, m] = vrijemeZagreb(new Date().toISOString()).split(":").map(Number);
  const sadaPx = ((h * 60 + m - prviSat * 60) / 60) * visinaSata;
  const stupciMreze = siroko ? "grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]" : "grid-cols-[1.75rem_repeat(7,minmax(0,1fr))]";

  // povlačenje termina (samo kad je onPremjesti zadan – na računalu)
  const [vuceni, setVuceni] = useState<Termin | null>(null);
  const [cilj, setCilj] = useState<Cilj | null>(null);
  const odmakY = useRef(0); // gdje je termin uhvaćen (px od vrha termina)

  function ciljIz(e: DragEvent<HTMLDivElement>, datum: string): Cilj {
    const kljuc = (e.target as HTMLElement).closest("[data-termin]")?.getAttribute("data-termin");
    const drugi = kljuc && vuceni && kljuc !== vuceni.kljuc ? termini.find((x) => x.kljuc === kljuc) : undefined;
    // Ctrl/Shift = stavi uz drugi termin (u isto vrijeme), bez zamjene
    if (drugi && !drugi.otkazan && !e.ctrlKey && !e.shiftKey) return { kljuc: drugi.kljuc };
    const vrh = e.currentTarget.getBoundingClientRect().top;
    const min = Math.round((prviSat * 60 + ((e.clientY - vrh - odmakY.current) / visinaSata) * 60) / 15) * 15;
    return { datum, min: Math.max(0, Math.min(24 * 60 - (vuceni?.trajanje ?? 60), min)) };
  }

  const isti = (a: Cilj | null, b: Cilj) =>
    a !== null && ("kljuc" in a && "kljuc" in b ? a.kljuc === b.kljuc : "min" in a && "min" in b && a.datum === b.datum && a.min === b.min);

  function pusti(e: DragEvent<HTMLDivElement>, datum: string) {
    e.preventDefault();
    const t = vuceni;
    const c = ciljIz(e, datum);
    setVuceni(null);
    setCilj(null);
    if (!t || !onPremjesti) return;
    if ("kljuc" in c) {
      const drugi = termini.find((x) => x.kljuc === c.kljuc);
      if (drugi) onPremjesti(t, { zamjena: drugi });
      return;
    }
    const vrijeme = uVrijeme(c.min);
    if (c.datum !== t.datum || vrijeme !== t.vrijeme) onPremjesti(t, { datum: c.datum, vrijeme });
  }

  return (
    <div className="-mx-2 select-none">
      {/* dani */}
      <div className={`grid ${stupciMreze} gap-px pb-1`}>
        <span />
        {dani.map((d, i) => (
          <div
            key={d}
            className={`flex flex-col items-center rounded-lg py-1 ${siroko ? "text-sm" : "text-xs"} ${d === danas ? "bg-vatra/15 text-orange-200" : "text-tekst-2"}`}
          >
            <span className="font-semibold">{DANI_KRATKO[i]}</span>
            <span className="tabular-nums">{danMjesec(d).split(".")[0]}.</span>
          </div>
        ))}
      </div>

      {/* sati */}
      <div className={`grid ${stupciMreze} gap-px`}>
        <div className="relative" style={{ height: visina }}>
          {sati.map((s, i) => (
            <span
              key={s}
              className={`absolute right-1 -translate-y-1/2 text-tekst-2 tabular-nums ${siroko ? "text-xs" : "text-[10px]"}`}
              style={{ top: i * visinaSata }}
            >
              {i === 0 ? "" : s}
            </span>
          ))}
        </div>
        {dani.map((d) => (
          <div
            key={d}
            className={`relative overflow-hidden rounded-md ${d === danas ? "bg-vatra/5" : "bg-povrsina"}`}
            style={{ height: visina }}
            onDragOver={
              onPremjesti && vuceni
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const c = ciljIz(e, d);
                    if (!isti(cilj, c)) setCilj(c);
                  }
                : undefined
            }
            onDrop={onPremjesti && vuceni ? (e) => pusti(e, d) : undefined}
          >
            {sati.map((s, i) => (
              <button
                key={s}
                type="button"
                aria-label={`Novi termin ${danMjesec(d)} u ${s}:00`}
                onClick={() => onPrazno(d, `${String(s).padStart(2, "0")}:00`)}
                className="absolute inset-x-0 border-t border-rub/60 active:bg-vatra/20"
                style={{ top: i * visinaSata, height: visinaSata }}
              />
            ))}

            {/* gdje će termin sjesti kad se pusti */}
            {vuceni && cilj && "min" in cilj && cilj.datum === d && (
              <div
                className="pointer-events-none absolute inset-x-0.5 z-30 rounded-md border-2 border-dashed border-white/80 bg-white/10 px-1 text-xs font-semibold text-white"
                style={{
                  top: ((cilj.min - prviSat * 60) / 60) * visinaSata + 1,
                  height: Math.max(20, (vuceni.trajanje / 60) * visinaSata - 2),
                }}
              >
                {uVrijeme(cilj.min)}
              </div>
            )}

            {d === danas && sadaPx > 0 && sadaPx < visina && (
              <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-vatra-2" style={{ top: sadaPx }} />
            )}

            {rasporedi(termini.filter((t) => t.datum === d)).map(({ t, stupac, stupaca }) => {
              const vrh = ((minute(t.vrijeme) - prviSat * 60) / 60) * visinaSata;
              const vis = Math.max(20, (t.trajanje / 60) * visinaSata - 2);
              const puno = imena[t.klijentId] ?? "Klijent";
              // kad je više klijenata u isto vrijeme, stupac je uzak – inicijali (npr. „IB”)
              // na računalu ima mjesta: puno ime (ili ime kad se preklapaju)
              const ime = siroko
                ? stupaca > 1
                  ? puno.split(" ")[0]
                  : puno
                : stupaca > 1
                  ? puno
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((d) => d[0]?.toUpperCase())
                      .join("")
                  : puno.split(" ")[0];
              const oznaka = oznake[kljucTreninga(t.klijentId, t.datum)];
              const prigusen = istaknut ? !istaknut(t) : false;
              // svaki klijent svoja boja; vrsta termina po rubu: isprekidan = samo jednom, ↻ = pomaknut, sivo = otkazan
              const b = bojaKlijenta(boje[t.klijentId]);
              const sivo = t.otkazan || oznaka?.nijeDosao;
              const stil = sivo
                ? { background: "rgba(63, 63, 70, 0.6)", borderColor: "rgb(82, 82, 91)", color: "#a1a1aa" }
                : { background: b.pozadina, borderColor: b.rub, color: b.tekst };
              return (
                <button
                  key={t.kljuc}
                  type="button"
                  data-termin={t.kljuc}
                  draggable={Boolean(onPremjesti) && !t.otkazan}
                  onDragStart={(e) => {
                    odmakY.current = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", t.kljuc);
                    setVuceni(t);
                  }}
                  onDragEnd={() => {
                    setVuceni(null);
                    setCilj(null);
                  }}
                  onClick={() => onTermin(t)}
                  title={`${imena[t.klijentId] ?? "Klijent"} · ${t.vrijeme}${t.pravilo ? "" : " · samo jednom"}${oznaka?.nijeDosao ? " · nije došao" : ""}`}
                  className={`absolute z-20 overflow-hidden rounded-md border-2 px-0.5 text-left leading-tight shadow-sm active:scale-[0.97] ${
                    t.pravilo ? "border-solid" : "border-dashed"
                  } ${t.otkazan ? "line-through" : ""} ${prigusen || vuceni?.kljuc === t.kljuc ? "opacity-25" : ""} ${
                    cilj && "kljuc" in cilj && cilj.kljuc === t.kljuc ? "ring-2 ring-white ring-offset-1 ring-offset-black" : ""
                  } ${onPremjesti && !t.otkazan ? "cursor-grab" : ""}`}
                  style={{
                    ...stil,
                    top: vrh + 1,
                    height: vis,
                    left: `calc(${(stupac / stupaca) * 100}% + 1px)`,
                    width: `calc(${100 / stupaca}% - 2px)`,
                  }}
                >
                  <span className={`block truncate font-semibold ${siroko ? "text-sm" : "text-[11px]"}`}>
                    {oznaka?.zavrsen ? "✓ " : oznaka?.nijeDosao ? "✗ " : ""}
                    {jePomaknut(t) ? "↻ " : ""}
                    {ime}
                  </span>
                  {siroko ? (
                    <>
                      {vis >= 38 && oznaka?.skupine.length ? (
                        <span className="block truncate text-xs font-medium opacity-90">{oznaka.skupine.join(" · ")}</span>
                      ) : null}
                      {(vis >= 56 || (vis >= 38 && !oznaka?.skupine.length)) && (
                        <span className="block truncate text-xs opacity-80 tabular-nums">{t.vrijeme}</span>
                      )}
                    </>
                  ) : (
                    vis >= 34 &&
                    (oznaka?.skupine.length ? (
                      <span className="block truncate text-[10px] font-medium opacity-90">{kratkeSkupine(oznaka.skupine)}</span>
                    ) : (
                      stupaca === 1 && <span className="block truncate text-[10px] opacity-80 tabular-nums">{t.vrijeme}</span>
                    ))
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
