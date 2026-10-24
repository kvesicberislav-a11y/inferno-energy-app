"use client";

import { useState } from "react";
import { Kartica } from "@/components/ui";
import { danMjesec, danasZagreb, dodajDane } from "@/lib/datum";
import { DANI, danUTjednu } from "@/lib/treninzi";
import { PopisTermina } from "./PopisTermina";
import { useRaspored } from "./useRaspored";

/** Klijent: termini s trenerom (sljedeća 2 tjedna). Ne prikazuje se ako ih nema. */
export function MojiTermini({ klijentId }: { klijentId: string }) {
  const danas = danasZagreb();
  const { raspored } = useRaspored(klijentId, danas, dodajDane(danas, 13));
  const [svi, setSvi] = useState(false);

  if (!raspored || (raspored.pravila.length === 0 && raspored.termini.length === 0)) return null;

  const sljedeci = raspored.termini.find((t) => !t.otkazan) ?? null;
  const prikazani = svi ? raspored.termini : raspored.termini.slice(0, 4);
  const stalni = [...raspored.pravila]
    .sort((a, b) => a.dan_u_tjednu - b.dan_u_tjednu)
    .map((p) => `${DANI[p.dan_u_tjednu - 1].slice(0, 3)} ${p.vrijeme}`)
    .join(" · ");

  return (
    <Kartica className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Termini s trenerom</h2>
        {stalni && <p className="text-sm text-tekst-2">Svaki tjedan: {stalni}</p>}
      </div>
      {sljedeci && (
        <div className="rounded-2xl border border-vatra/40 bg-vatra/10 px-4 py-3">
          <p className="text-xs text-tekst-2">Sljedeći termin</p>
          <p className="text-xl font-bold">
            {sljedeci.datum === danas
              ? "Danas"
              : sljedeci.datum === dodajDane(danas, 1)
                ? "Sutra"
                : `${DANI[danUTjednu(sljedeci.datum) - 1]}, ${danMjesec(sljedeci.datum)}`}{" "}
            u {sljedeci.vrijeme}
          </p>
        </div>
      )}
      <PopisTermina termini={prikazani} prikaziIme={false} prazno="Nema termina u sljedeća 2 tjedna." />
      {raspored.termini.length > 4 && (
        <button type="button" onClick={() => setSvi((s) => !s)} className="self-start text-sm text-tekst-2 underline">
          {svi ? "Prikaži manje" : `Prikaži sve (${raspored.termini.length})`}
        </button>
      )}
    </Kartica>
  );
}
