"use client";

import { useState } from "react";
import Link from "next/link";
import { Ploca } from "@/components/Ploca";
import { Cip, Poruka, Ucitavanje } from "@/components/ui";
import { MISICNE_SKUPINE, type Vjezba } from "@/lib/treninzi";
import { SlicicaVjezbe } from "./VideoVjezbe";
import { filtrirajVjezbe, useVjezbe } from "./useVjezbe";

/** Odabir vježbe iz biblioteke (za plan treninga). */
export function OdabirVjezbe({
  onOdabir,
  onZatvori,
}: {
  onOdabir: (v: Vjezba) => void;
  onZatvori: () => void;
}) {
  const { vjezbe, greska } = useVjezbe();
  const [upit, setUpit] = useState("");
  const [skupina, setSkupina] = useState<string | null>(null);
  const prikazane = vjezbe ? filtrirajVjezbe(vjezbe, upit, skupina) : [];

  return (
    <Ploca naslov="Odaberi vježbu" onZatvori={onZatvori}>
      <div className="flex flex-col gap-3">
        <input
          type="search"
          aria-label="Pretraži vježbe"
          placeholder="Pretraži…"
          value={upit}
          onChange={(e) => setUpit(e.target.value)}
          className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
        />
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          <Cip aktivan={skupina === null} onClick={() => setSkupina(null)}>
            Sve
          </Cip>
          {MISICNE_SKUPINE.map((s) => (
            <Cip key={s} aktivan={skupina === s} onClick={() => setSkupina(skupina === s ? null : s)}>
              {s}
            </Cip>
          ))}
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {vjezbe === null ? (
          !greska && <Ucitavanje />
        ) : vjezbe.length === 0 ? (
          <Poruka>
            Biblioteka vježbi je prazna.{" "}
            <Link href="/trener/vjezbe" className="font-semibold text-vatra">
              Dodaj vježbe
            </Link>
          </Poruka>
        ) : prikazane.length === 0 ? (
          <Poruka>Nijedna vježba ne odgovara pretrazi.</Poruka>
        ) : (
          <div className="flex flex-col gap-2">
            {prikazane.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onOdabir(v)}
                className="flex w-full items-center gap-3 rounded-2xl border border-rub bg-povrsina-2 p-3 text-left active:scale-[0.99]"
              >
                <SlicicaVjezbe slikaUrl={v.slika_url} youtubeUrl={v.youtube_url} className="h-12 w-12" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{v.naziv}</p>
                  <p className="text-sm text-tekst-2">{v.misicna_skupina}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Ploca>
  );
}
