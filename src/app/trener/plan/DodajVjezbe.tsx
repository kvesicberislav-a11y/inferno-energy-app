"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka, Ucitavanje } from "@/components/ui";
import { kratkoMax } from "@/components/trening/useBazneIKilaze";
import { filtrirajVjezbe, useVjezbe } from "@/components/vjezbe/useVjezbe";
import type { Kilaza, Vjezba } from "@/lib/treninzi";

/**
 * Dodavanje vježbi u trening za jednu mišićnu skupinu.
 * Prvo se nude bazne vježbe klijenta (s njegovom najvećom kilažom), ostale na zahtjev.
 */
export function DodajVjezbe({
  skupina,
  klijentId,
  bazne,
  kilaze,
  vecUDanu,
  onDodaj,
  onZatvori,
}: {
  skupina: string;
  klijentId: string | null;
  bazne: Set<string>;
  kilaze: Map<string, Kilaza>;
  vecUDanu: string[];
  onDodaj: (vjezbe: Vjezba[]) => Promise<string | null>;
  onZatvori: () => void;
}) {
  const { vjezbe, greska: greskaUcitavanja } = useVjezbe({ vrsta: "sve" });
  const [odabrane, setOdabrane] = useState<Vjezba[]>([]);
  const [sveVjezbe, setSveVjezbe] = useState(false);
  const [upit, setUpit] = useState("");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  // biblioteka + vlastite vježbe ovog klijenta, iz ove skupine
  const uSkupini = vjezbe
    ? filtrirajVjezbe(vjezbe, upit, skupina).filter((v) => v.vlasnik_id === null || v.vlasnik_id === klijentId)
    : [];
  const njegove = uSkupini.filter((v) => bazne.has(v.id));
  const ostale = uSkupini.filter((v) => !bazne.has(v.id));
  const prikaziOstale = sveVjezbe || njegove.length === 0;

  function promijeni(v: Vjezba) {
    setOdabrane((o) => (o.some((x) => x.id === v.id) ? o.filter((x) => x.id !== v.id) : [...o, v]));
  }

  async function dodaj() {
    if (odabrane.length === 0) return;
    setSalje(true);
    setGreska(null);
    const g = await onDodaj(odabrane);
    setSalje(false);
    if (g) setGreska(g);
  }

  const red = (v: Vjezba) => {
    const redni = odabrane.findIndex((x) => x.id === v.id);
    const vec = vecUDanu.includes(v.id);
    const max = kratkoMax(kilaze.get(v.id));
    return (
      <button
        key={v.id}
        type="button"
        onClick={() => promijeni(v)}
        aria-pressed={redni >= 0}
        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
          redni >= 0 ? "border-vatra bg-vatra/10" : "border-rub bg-povrsina-2"
        }`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            redni >= 0 ? "bg-vatra text-white" : "border border-rub text-transparent"
          }`}
        >
          {redni >= 0 ? redni + 1 : "·"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{v.naziv}</span>
          <span className="block text-sm text-tekst-2">
            {max ?? "nema upisane kilaže"}
            {vec ? " · već je u ovom treningu" : ""}
            {v.vlasnik_id ? " · njegova vježba" : ""}
          </span>
        </span>
      </button>
    );
  };

  return (
    <Ploca naslov={`Dodaj: ${skupina}`} onZatvori={onZatvori}>
      <div className="flex flex-col gap-3">
        {vjezbe === null ? (
          greskaUcitavanja ? <Poruka tip="greska">{greskaUcitavanja}</Poruka> : <Ucitavanje />
        ) : (
          <>
            {uSkupini.length + odabrane.length > 8 && (
              <input
                type="search"
                aria-label="Pretraži vježbe"
                placeholder="Pretraži…"
                value={upit}
                onChange={(e) => setUpit(e.target.value)}
                className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
              />
            )}

            {njegove.length > 0 && (
              <>
                <p className="text-sm font-semibold text-tekst-2">Njegove bazne vježbe</p>
                <div className="flex flex-col gap-2">{njegove.map(red)}</div>
              </>
            )}

            {njegove.length === 0 && !upit && (
              <Poruka>Klijent još nema baznih vježbi za {skupina.toLowerCase()}. Odaberi iz biblioteke.</Poruka>
            )}

            {ostale.length > 0 &&
              (prikaziOstale ? (
                <>
                  <p className="pt-1 text-sm font-semibold text-tekst-2">Ostale vježbe iz biblioteke</p>
                  <div className="flex flex-col gap-2">{ostale.map(red)}</div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSveVjezbe(true)}
                  className="self-start py-2 text-sm font-semibold text-vatra"
                >
                  Prikaži ostale vježbe ({ostale.length})
                </button>
              ))}

            {uSkupini.length === 0 && <Poruka>Nema vježbi{upit ? " za tu pretragu" : " u ovoj skupini"}.</Poruka>}

            {odabrane.some((v) => !bazne.has(v.id)) && (
              <p className="text-xs text-tekst-2">Vježbe koje odabereš iz biblioteke postaju i njegove bazne.</p>
            )}
            {greska && <Poruka tip="greska">{greska}</Poruka>}

            <div className="sticky bottom-0 -mx-5 border-t border-rub bg-povrsina px-5 pt-3">
              <Gumb onClick={dodaj} disabled={salje || odabrane.length === 0}>
                {salje
                  ? "Dodajem…"
                  : odabrane.length === 0
                    ? "Odaberi vježbe"
                    : `Dodaj ${odabrane.length} ${odabrane.length === 1 ? "vježbu" : odabrane.length < 5 ? "vježbe" : "vježbi"}`}
              </Gumb>
            </div>
          </>
        )}
      </div>
    </Ploca>
  );
}
