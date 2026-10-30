"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka } from "@/components/ui";
import { MISICNE_SKUPINE } from "@/lib/treninzi";

/** Odabir mišićnih skupina za trening (redom kojim se dodiruju). */
export function SkupineForma({
  naslov,
  pocetne,
  onSpremi,
  onZatvori,
}: {
  naslov: string;
  pocetne: string[];
  onSpremi: (skupine: string[]) => Promise<string | null>;
  onZatvori: () => void;
}) {
  const [odabrane, setOdabrane] = useState<string[]>(pocetne);
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  function promijeni(s: string) {
    setOdabrane((o) => (o.includes(s) ? o.filter((x) => x !== s) : [...o, s]));
  }

  async function spremi() {
    if (odabrane.length === 0) return setGreska("Odaberi barem jednu skupinu.");
    setSalje(true);
    const g = await onSpremi(odabrane);
    setSalje(false);
    if (g) setGreska(g);
  }

  return (
    <Ploca naslov={naslov} onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <p className="text-tekst-2">Što se radi taj dan? Dodiruj redom kojim idu na treningu.</p>
        <div className="grid grid-cols-2 gap-2">
          {MISICNE_SKUPINE.map((s) => {
            const redni = odabrane.indexOf(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => promijeni(s)}
                aria-pressed={redni >= 0}
                className={`flex h-12 items-center gap-2 rounded-2xl px-3 text-left font-semibold transition active:scale-[0.98] ${
                  redni >= 0 ? "bg-vatra text-white" : "border border-rub bg-povrsina-2 text-tekst-2"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    redni >= 0 ? "bg-white/25" : "border border-rub"
                  }`}
                >
                  {redni >= 0 ? redni + 1 : ""}
                </span>
                <span className="truncate">{s}</span>
              </button>
            );
          })}
        </div>
        {odabrane.length > 0 && <p className="text-sm text-tekst-2">Redom: {odabrane.join(" → ")}</p>}
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb onClick={spremi} disabled={salje}>
          {salje ? "Spremam…" : "Spremi"}
        </Gumb>
      </div>
    </Ploca>
  );
}
