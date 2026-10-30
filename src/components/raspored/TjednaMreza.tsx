"use client";

import { danMjesec, dodajDane, vrijemeZagreb } from "@/lib/datum";
import { bojaKlijenta } from "@/lib/boje";
import { kljucTreninga, kratkeSkupine } from "@/lib/kalendar";
import { jePomaknut, type Termin } from "@/lib/raspored";
import { DANI_KRATKO } from "@/lib/treninzi";

const VISINA_SATA = 48; // px
const PRVI_SAT = 7;
const ZADNJI_SAT = 21; // zadnji red počinje u 20:00 i završava u 21:00

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
}: {
  pon: string;
  danas: string;
  termini: Termin[];
  imena: Record<string, string>;
  /** trening iz kalendara po terminu (ključ klijent|datum): skupine i je li završen */
  oznake?: Record<string, { skupine: string[]; zavrsen: boolean }>;
  /** filter: termini koji ne odgovaraju prikazuju se posivljeno */
  istaknut?: (t: Termin) => boolean;
  /** redni broj boje po klijentu */
  boje?: Record<string, number | null>;
  onTermin: (t: Termin) => void;
  onPrazno: (datum: string, vrijeme: string) => void;
}) {
  const dani = Array.from({ length: 7 }, (_, i) => dodajDane(pon, i));
  const prviSat = Math.min(PRVI_SAT, ...termini.map((t) => Math.floor(minute(t.vrijeme) / 60)));
  const zadnjiSat = Math.max(ZADNJI_SAT, ...termini.map((t) => Math.ceil((minute(t.vrijeme) + t.trajanje) / 60)));
  const sati = Array.from({ length: zadnjiSat - prviSat }, (_, i) => prviSat + i);
  const visina = sati.length * VISINA_SATA;
  const [h, m] = vrijemeZagreb(new Date().toISOString()).split(":").map(Number);
  const sadaPx = ((h * 60 + m - prviSat * 60) / 60) * VISINA_SATA;

  return (
    <div className="-mx-2 select-none">
      {/* dani */}
      <div className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-px pb-1">
        <span />
        {dani.map((d, i) => (
          <div
            key={d}
            className={`flex flex-col items-center rounded-lg py-1 text-xs ${d === danas ? "bg-vatra/15 text-orange-200" : "text-tekst-2"}`}
          >
            <span className="font-semibold">{DANI_KRATKO[i]}</span>
            <span className="tabular-nums">{danMjesec(d).split(".")[0]}.</span>
          </div>
        ))}
      </div>

      {/* sati */}
      <div className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-px">
        <div className="relative" style={{ height: visina }}>
          {sati.map((s, i) => (
            <span
              key={s}
              className="absolute right-1 -translate-y-1/2 text-[10px] text-tekst-2 tabular-nums"
              style={{ top: i * VISINA_SATA }}
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
          >
            {sati.map((s, i) => (
              <button
                key={s}
                type="button"
                aria-label={`Novi termin ${danMjesec(d)} u ${s}:00`}
                onClick={() => onPrazno(d, `${String(s).padStart(2, "0")}:00`)}
                className="absolute inset-x-0 border-t border-rub/60 active:bg-vatra/20"
                style={{ top: i * VISINA_SATA, height: VISINA_SATA }}
              />
            ))}

            {d === danas && sadaPx > 0 && sadaPx < visina && (
              <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-vatra-2" style={{ top: sadaPx }} />
            )}

            {rasporedi(termini.filter((t) => t.datum === d)).map(({ t, stupac, stupaca }) => {
              const vrh = ((minute(t.vrijeme) - prviSat * 60) / 60) * VISINA_SATA;
              const vis = Math.max(20, (t.trajanje / 60) * VISINA_SATA - 2);
              const puno = imena[t.klijentId] ?? "Klijent";
              // kad je više klijenata u isto vrijeme, stupac je uzak – inicijali (npr. „IB”)
              const ime =
                stupaca > 1
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
              const stil = t.otkazan
                ? { background: "rgba(63, 63, 70, 0.6)", borderColor: "rgb(82, 82, 91)", color: "#a1a1aa" }
                : { background: b.pozadina, borderColor: b.rub, color: b.tekst };
              return (
                <button
                  key={t.kljuc}
                  type="button"
                  onClick={() => onTermin(t)}
                  title={`${imena[t.klijentId] ?? "Klijent"} · ${t.vrijeme}${t.pravilo ? "" : " · samo jednom"}`}
                  className={`absolute z-20 overflow-hidden rounded-md border-2 px-0.5 text-left leading-tight shadow-sm active:scale-[0.97] ${
                    t.pravilo ? "border-solid" : "border-dashed"
                  } ${t.otkazan ? "line-through" : ""} ${prigusen ? "opacity-25" : ""}`}
                  style={{
                    ...stil,
                    top: vrh + 1,
                    height: vis,
                    left: `calc(${(stupac / stupaca) * 100}% + 1px)`,
                    width: `calc(${100 / stupaca}% - 2px)`,
                  }}
                >
                  <span className="block truncate text-[11px] font-semibold">
                    {oznaka?.zavrsen ? "✓ " : ""}
                    {jePomaknut(t) ? "↻ " : ""}
                    {ime}
                  </span>
                  {vis >= 34 &&
                    (oznaka?.skupine.length ? (
                      <span className="block truncate text-[10px] font-medium opacity-90">{kratkeSkupine(oznaka.skupine)}</span>
                    ) : (
                      stupaca === 1 && <span className="block truncate text-[10px] opacity-80 tabular-nums">{t.vrijeme}</span>
                    ))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
