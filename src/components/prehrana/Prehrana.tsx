"use client";

import { useState } from "react";
import { danasZagreb } from "@/lib/datum";
import { DanPrikaz } from "./DanPrikaz";
import { TjedanPrikaz } from "./TjedanPrikaz";

type Prikaz = "dan" | "tjedan";

/** Makroi klijenta: dnevni prikaz s unosom i tjedni pregled. */
export function Prehrana({ klijentId, mozeUredivati }: { klijentId: string; mozeUredivati: boolean }) {
  const [prikaz, setPrikaz] = useState<Prikaz>("dan");
  const [datum, setDatum] = useState(() => danasZagreb());

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-rub bg-povrsina p-1">
        {(
          [
            ["dan", "Dan"],
            ["tjedan", "Tjedan"],
          ] as const
        ).map(([vrijednost, oznaka]) => (
          <button
            key={vrijednost}
            type="button"
            onClick={() => setPrikaz(vrijednost)}
            className={`h-11 rounded-xl text-base font-semibold transition ${
              prikaz === vrijednost ? "bg-povrsina-2 text-tekst shadow" : "text-tekst-2"
            }`}
          >
            {oznaka}
          </button>
        ))}
      </div>

      {prikaz === "dan" ? (
        <DanPrikaz klijentId={klijentId} datum={datum} setDatum={setDatum} mozeUredivati={mozeUredivati} />
      ) : (
        <TjedanPrikaz
          klijentId={klijentId}
          odaberiDan={(dan) => {
            setDatum(dan);
            setPrikaz("dan");
          }}
        />
      )}
    </div>
  );
}
