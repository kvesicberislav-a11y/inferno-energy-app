"use client";

import { useState } from "react";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Cip, Gumb, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { SlicicaVjezbe } from "@/components/vjezbe/VideoVjezbe";
import { VjezbaForma } from "@/components/vjezbe/VjezbaForma";
import { filtrirajVjezbe, useVjezbe } from "@/components/vjezbe/useVjezbe";
import { MISICNE_SKUPINE, youtubeId, type Vjezba } from "@/lib/treninzi";

function BibliotekaVjezbi() {
  const { vjezbe, greska, osvjezi } = useVjezbe();
  const [upit, setUpit] = useState("");
  const [skupina, setSkupina] = useState<string | null>(null);
  const [forma, setForma] = useState<{ vjezba: Vjezba | null } | null>(null);

  const prikazane = vjezbe ? filtrirajVjezbe(vjezbe, upit, skupina) : [];

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl font-bold">Vježbe</h1>
        <Gumb malen onClick={() => setForma({ vjezba: null })}>
          + Nova vježba
        </Gumb>
      </div>

      <input
        type="search"
        aria-label="Pretraži vježbe"
        placeholder="Pretraži…"
        value={upit}
        onChange={(e) => setUpit(e.target.value)}
        className="h-12 w-full rounded-2xl border border-rub bg-povrsina px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
      />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
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
        <Poruka>Biblioteka je prazna. Dodaj prvu vježbu gumbom „+ Nova vježba”.</Poruka>
      ) : prikazane.length === 0 ? (
        <Poruka>Nijedna vježba ne odgovara pretrazi.</Poruka>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-tekst-2">{prikazane.length} vježbi</p>
          {prikazane.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setForma({ vjezba: v })}
              className="flex w-full items-center gap-3 rounded-2xl border border-rub bg-povrsina p-3 text-left active:scale-[0.99]"
            >
              <SlicicaVjezbe slikaUrl={v.slika_url} youtubeUrl={v.youtube_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{v.naziv}</p>
                <p className="text-sm text-tekst-2">
                  {v.misicna_skupina}
                  {youtubeId(v.youtube_url) ? " · ▶ video" : ""}
                </p>
              </div>
              <span className="text-2xl text-tekst-2" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      )}

      {forma && (
        <VjezbaForma
          postojeca={forma.vjezba}
          onZatvori={() => setForma(null)}
          onSpremljeno={() => {
            setForma(null);
            osvjezi();
          }}
        />
      )}
    </>
  );
}

export default function TrenerVjezbeStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Zaglavlje />
        <BibliotekaVjezbi />
      </Stranica>
    </Zasticeno>
  );
}
