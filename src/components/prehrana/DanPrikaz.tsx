"use client";

import { useState } from "react";
import { Gumb, Kartica, Poruka, Ucitavanje } from "@/components/ui";
import { danasZagreb, dodajDane, opisDana } from "@/lib/datum";
import { ciljZaDan, formatG, formatKcal, zbroj, type Obrok } from "@/lib/makroi";
import { TrakaNapretka } from "./TrakaNapretka";
import { UnosObroka } from "./UnosObroka";
import { usePrehrana } from "./usePrehrana";

function naslovDana(datum: string, danas: string) {
  if (datum === danas) return "Danas";
  if (datum === dodajDane(danas, -1)) return "Jučer";
  return opisDana(datum).split(",")[0];
}

export function DanPrikaz({
  klijentId,
  datum,
  setDatum,
  mozeUredivati,
}: {
  klijentId: string;
  datum: string;
  setDatum: (d: string) => void;
  mozeUredivati: boolean;
}) {
  const danas = danasZagreb();
  const { obroci, ciljevi, greska, osvjezi } = usePrehrana(klijentId, datum, datum);
  const [uredivanje, setUredivanje] = useState<{ obrok: Obrok | null } | null>(null);

  const cilj = ciljevi ? ciljZaDan(ciljevi, datum) : null;
  const ukupno = zbroj(obroci ?? []);
  const mozeDodati = mozeUredivati && datum <= danas;

  const zatvori = () => setUredivanje(null);
  const spremljeno = () => {
    setUredivanje(null);
    osvjezi();
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Prethodni dan"
          onClick={() => setDatum(dodajDane(datum, -1))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95"
        >
          ‹
        </button>
        <button type="button" onClick={() => setDatum(danas)} className="flex flex-col items-center">
          <span className="text-lg font-bold">{naslovDana(datum, danas)}</span>
          <span className="text-sm text-tekst-2">{opisDana(datum)}</span>
        </button>
        <button
          type="button"
          aria-label="Sljedeći dan"
          onClick={() => setDatum(dodajDane(datum, 1))}
          disabled={datum >= danas}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95 disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {greska && <Poruka tip="greska">{greska}</Poruka>}

      {obroci === null ? (
        <Ucitavanje />
      ) : (
        <>
          <Kartica className="flex flex-col gap-4">
            <TrakaNapretka vrsta="kcal" oznaka="Kalorije" unos={ukupno.kcal} cilj={cilj?.kcal ?? null} />
            <TrakaNapretka vrsta="proteini" oznaka="Proteini" unos={ukupno.proteini} cilj={cilj?.proteini ?? null} />
            <TrakaNapretka
              vrsta="ugljikohidrati"
              oznaka="Ugljikohidrati"
              unos={ukupno.ugljikohidrati}
              cilj={cilj?.ugljikohidrati ?? null}
            />
            <TrakaNapretka vrsta="masti" oznaka="Masti" unos={ukupno.masti} cilj={cilj?.masti ?? null} />
            {!cilj && (
              <p className="text-sm text-tekst-2">Dnevni cilj još nije postavljen.</p>
            )}
          </Kartica>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-tekst-2">Obroci</h2>
            {obroci.length === 0 ? (
              <Poruka>
                {mozeDodati ? "Još nema obroka. Dodaj prvi gumbom dolje." : "Nema unesenih obroka."}
              </Poruka>
            ) : (
              obroci.map((o) => {
                const sadrzaj = (
                  <>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{o.naziv}</p>
                      <p className="text-sm text-tekst-2 tabular-nums">
                        P {formatG(o.proteini)} · UH {formatG(o.ugljikohidrati)} · M {formatG(o.masti)} g
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatKcal(o.kcal)} kcal</span>
                  </>
                );
                const stil =
                  "flex w-full items-center justify-between gap-3 rounded-2xl border border-rub bg-povrsina px-4 py-3 text-left";
                return mozeUredivati ? (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setUredivanje({ obrok: o })}
                    className={`${stil} active:scale-[0.99]`}
                  >
                    {sadrzaj}
                  </button>
                ) : (
                  <div key={o.id} className={stil}>
                    {sadrzaj}
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      {mozeDodati && (
        <>
          <div className="h-20" aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md bg-linear-to-t from-pozadina via-pozadina/95 to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Gumb onClick={() => setUredivanje({ obrok: null })}>+ Dodaj obrok</Gumb>
          </div>
        </>
      )}

      {uredivanje && (
        <UnosObroka
          klijentId={klijentId}
          datum={datum}
          postojeci={uredivanje.obrok}
          onZatvori={zatvori}
          onSpremljeno={spremljeno}
        />
      )}
    </>
  );
}
