"use client";

import { danasZagreb, opisDana } from "@/lib/datum";
import { jePomaknut, type Termin } from "@/lib/raspored";

/** Termini grupirani po danima. Ako je `onOdabir` zadan, termin se može dodirnuti (trener). */
export function PopisTermina({
  termini,
  imena,
  prikaziIme,
  onOdabir,
  prazno = "Nema termina.",
}: {
  termini: Termin[];
  imena?: Record<string, string>;
  prikaziIme: boolean;
  onOdabir?: (t: Termin) => void;
  prazno?: string;
}) {
  const danas = danasZagreb();
  if (termini.length === 0) return <p className="text-sm text-tekst-2">{prazno}</p>;

  const dani = [...new Set(termini.map((t) => t.datum))];
  return (
    <div className="flex flex-col gap-3">
      {dani.map((d) => (
        <div key={d} className="flex flex-col gap-1.5">
          <p className={`text-sm font-semibold ${d === danas ? "text-vatra" : "text-tekst-2"}`}>
            {d === danas ? "Danas · " : ""}
            {opisDana(d)}
          </p>
          {termini
            .filter((t) => t.datum === d)
            .map((t) => {
              const sadrzaj = (
                <>
                  <span
                    className={`w-14 shrink-0 text-lg font-bold tabular-nums ${t.otkazan ? "text-tekst-2 line-through" : ""}`}
                  >
                    {t.vrijeme}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-semibold ${t.otkazan ? "text-tekst-2 line-through" : ""}`}>
                      {prikaziIme ? (imena?.[t.klijentId] ?? "Klijent") : "Trening s trenerom"}
                    </span>
                    <span className="block truncate text-xs text-tekst-2">
                      {t.trajanje} min
                      {t.otkazan ? " · otkazano" : jePomaknut(t) ? " · pomaknuto" : ""}
                      {!t.pravilo ? " · dodatni" : ""}
                      {t.napomena ? ` · ${t.napomena}` : ""}
                    </span>
                  </span>
                  {t.otkazan ? (
                    <span className="shrink-0 rounded-lg bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
                      otkazano
                    </span>
                  ) : jePomaknut(t) ? (
                    <span className="shrink-0 rounded-lg bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
                      pomaknuto
                    </span>
                  ) : null}
                </>
              );
              const stil = "flex w-full items-center gap-3 rounded-2xl border border-rub bg-povrsina-2 px-3 py-2.5 text-left";
              return onOdabir ? (
                <button key={t.kljuc} type="button" onClick={() => onOdabir(t)} className={`${stil} active:scale-[0.99]`}>
                  {sadrzaj}
                </button>
              ) : (
                <div key={t.kljuc} className={stil}>
                  {sadrzaj}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
