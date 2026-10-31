"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { OdabirPracenih, usePraceneVjezbe } from "@/components/napredak/PraceneVjezbe";
import { Cip, Gumb, Poruka } from "@/components/ui";
import { danasZagreb } from "@/lib/datum";
import { dohvatiPodatkeIzvoza, imeZaDatoteku } from "@/lib/izvoz/podaci";
import { mozeDijeliti, podijeli, preuzmi } from "@/lib/izvoz/spremi";

const RAZDOBLJA = [
  { dana: 30, oznaka: "30 dana" },
  { dana: 90, oznaka: "90 dana" },
  { dana: null, oznaka: "Cijelo vrijeme" },
] as const;

type Gotova = { blob: Blob; ime: string; vrsta: "Excel" | "PDF" };

/** Trener izvozi podatke klijenta u Excel ili PDF izvještaj. */
export function Izvoz({ klijentId, ime }: { klijentId: string; ime: string }) {
  const [otvoreno, setOtvoreno] = useState(false);
  const [dana, setDana] = useState<number | null>(30);
  const [radi, setRadi] = useState<"Excel" | "PDF" | null>(null);
  const [gotova, setGotova] = useState<Gotova | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  // napredak po vježbi: sve ili samo praćene (odabir se pamti za klijenta)
  const pracene = usePraceneVjezbe(klijentId);
  const [samoOdabrane, setSamoOdabrane] = useState<boolean | null>(null);
  const odabrane = samoOdabrane ?? pracene.ids.size > 0;
  const [biranje, setBiranje] = useState(false);

  async function izvezi(vrsta: "Excel" | "PDF") {
    setGreska(null);
    setGotova(null);
    setRadi(vrsta);
    try {
      const podaci = await dohvatiPodatkeIzvoza(klijentId, dana, odabrane ? [...pracene.ids] : null);
      const osnova = `INFERNO_${imeZaDatoteku(ime)}_${danasZagreb()}`;
      if (vrsta === "Excel") {
        const { napraviExcel } = await import("@/lib/izvoz/excel");
        const blob = await napraviExcel(podaci);
        const g = { blob, ime: `${osnova}.xlsx`, vrsta } as const;
        setGotova(g);
        preuzmi(g.blob, g.ime);
      } else {
        const { napraviPdf } = await import("@/lib/izvoz/pdf");
        const blob = await napraviPdf(podaci);
        const g = { blob, ime: `${osnova}_napredak.pdf`, vrsta } as const;
        setGotova(g);
        preuzmi(g.blob, g.ime);
      }
    } catch (e) {
      setGreska(`Izvoz nije uspio: ${e instanceof Error ? e.message : "nepoznata greška"}`);
    } finally {
      setRadi(null);
    }
  }

  async function posalji() {
    if (!gotova) return;
    try {
      await podijeli(gotova.blob, gotova.ime, `${ime} – INFERNO ENERGY`);
    } catch {
      setGreska("Dijeljenje nije uspjelo. Datoteku možeš poslati iz mape Preuzimanja.");
    }
  }

  if (!otvoreno) {
    return (
      <Gumb varijanta="sporedni" malen onClick={() => setOtvoreno(true)}>
        ⤓ Izvoz
      </Gumb>
    );
  }

  return (
    <Ploca naslov="Izvoz podataka" onZatvori={() => setOtvoreno(false)}>
      <div className="flex flex-col gap-4">
        <p className="-mt-2 text-sm text-tekst-2">{ime}</p>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Razdoblje</span>
          <div className="grid grid-cols-3 gap-2">
            {RAZDOBLJA.map((r) => (
              <Cip key={r.oznaka} aktivan={dana === r.dana} onClick={() => setDana(r.dana)}>
                {r.oznaka}
              </Cip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Napredak po vježbi</span>
          <div className="grid grid-cols-2 gap-2">
            <Cip aktivan={!odabrane} onClick={() => setSamoOdabrane(false)}>
              Sve vježbe
            </Cip>
            <Cip
              aktivan={odabrane}
              disabled={!pracene.ucitano}
              onClick={() => {
                setSamoOdabrane(true);
                if (pracene.ids.size === 0) setBiranje(true);
              }}
            >
              Odabrane ({pracene.ids.size})
            </Cip>
          </div>
          {odabrane && (
            <button type="button" onClick={() => setBiranje(true)} className="self-start py-1 text-sm font-semibold text-vatra">
              Uredi odabir vježbi
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Gumb onClick={() => izvezi("PDF")} disabled={radi !== null || (odabrane && pracene.ids.size === 0)}>
            {radi === "PDF" ? "Izrađujem PDF…" : "PDF izvještaj o napretku"}
          </Gumb>
          <p className="-mt-1 text-xs text-tekst-2">
            Pregled za klijenta: mjere i promjene, BMI i % masti, prehrana prema cilju, treninzi, najbolje serije i
            napredak svake vježbe, s grafovima.
          </p>
          <Gumb varijanta="sporedni" onClick={() => izvezi("Excel")} disabled={radi !== null || (odabrane && pracene.ids.size === 0)}>
            {radi === "Excel" ? "Izrađujem Excel…" : "Excel tablica (svi podaci)"}
          </Gumb>
          <p className="-mt-1 text-xs text-tekst-2">
            Listovi: sažetak, prehrana po danima, svi obroci, mjerenja, treninzi (svaka serija), napredak po vježbi i po
            mjesecima te povijest ciljeva.
          </p>
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}

        {biranje && (
          <OdabirPracenih
            klijentId={klijentId}
            odabrane={pracene.ids}
            onPromjena={() => pracene.osvjezi()}
            onZatvori={() => setBiranje(false)}
          />
        )}

        {gotova && (
          <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3">
            <p className="text-sm">
              ✓ {gotova.vrsta} je spremljen: <strong className="break-all">{gotova.ime}</strong>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Gumb varijanta="sporedni" malen onClick={() => preuzmi(gotova.blob, gotova.ime)}>
                Preuzmi ponovno
              </Gumb>
              {mozeDijeliti(gotova.blob, gotova.ime) && (
                <Gumb malen onClick={posalji}>
                  Pošalji…
                </Gumb>
              )}
            </div>
          </div>
        )}
      </div>
    </Ploca>
  );
}
