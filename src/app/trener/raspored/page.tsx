"use client";

import { useState } from "react";
import { NoviTermin } from "@/components/raspored/NoviTermin";
import { TerminRadnje } from "@/components/raspored/TerminRadnje";
import { TjednaMreza } from "@/components/raspored/TjednaMreza";
import { useRaspored } from "@/components/raspored/useRaspored";
import { useDanas } from "@/components/useDanas";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Gumb, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { danMjesec, dodajDane, ponedjeljak } from "@/lib/datum";
import type { Termin } from "@/lib/raspored";

function TjedniRaspored() {
  const danas = useDanas();
  const [pon, setPon] = useState(() => ponedjeljak(danas));
  const ned = dodajDane(pon, 6);
  const { raspored, osvjezi } = useRaspored(null, pon, ned);
  const [odabrani, setOdabrani] = useState<Termin | null>(null);
  const [novi, setNovi] = useState<{ datum: string; vrijeme: string } | null>(null);
  const [obavijest, setObavijest] = useState<string | null>(null);

  function gotovo(poruka: string) {
    setOdabrani(null);
    setNovi(null);
    setObavijest(poruka);
    osvjezi();
  }

  const aktivni = raspored?.termini.filter((t) => !t.otkazan).length ?? 0;
  const brojKlijenata = raspored ? new Set(raspored.termini.filter((t) => !t.otkazan).map((t) => t.klijentId)).size : 0;
  const ovajTjedan = pon === ponedjeljak(danas);

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl font-bold">Raspored</h1>
        <Gumb malen onClick={() => setNovi({ datum: pon > danas ? pon : danas, vrijeme: "18:00" })}>
          + Termin
        </Gumb>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Prethodni tjedan"
          onClick={() => setPon(dodajDane(pon, -7))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95"
        >
          ‹
        </button>
        <button type="button" onClick={() => setPon(ponedjeljak(danas))} className="flex flex-col items-center">
          <span className="text-lg font-bold">{ovajTjedan ? "Ovaj tjedan" : "Tjedan"}</span>
          <span className="text-sm text-tekst-2">
            {danMjesec(pon)} – {danMjesec(ned)}
            {!ovajTjedan && " · natrag na danas"}
          </span>
        </button>
        <button
          type="button"
          aria-label="Sljedeći tjedan"
          onClick={() => setPon(dodajDane(pon, 7))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95"
        >
          ›
        </button>
      </div>

      {obavijest && <Poruka tip="uspjeh">{obavijest}</Poruka>}

      {!raspored ? (
        <Ucitavanje />
      ) : (
        <>
          {raspored.greska && <Poruka tip="greska">{raspored.greska}</Poruka>}
          <p className="-mb-2 text-sm text-tekst-2">
            {aktivni} {aktivni === 1 ? "termin" : "termina"} · {brojKlijenata} {brojKlijenata === 1 ? "klijent" : "klijenata"} ·
            dodirni prazno polje za novi termin
          </p>
          <TjednaMreza
            pon={pon}
            danas={danas}
            termini={raspored.termini}
            imena={raspored.imena}
            onTermin={setOdabrani}
            onPrazno={(datum, vrijeme) => setNovi({ datum, vrijeme })}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tekst-2">
            <Legenda boja="border-vatra/60 bg-vatra/30">svaki tjedan</Legenda>
            <Legenda boja="border-sky-400/60 bg-sky-500/25">jednom</Legenda>
            <Legenda boja="border-amber-400/60 bg-amber-400/25">pomaknut</Legenda>
            <Legenda boja="border-zinc-600 bg-zinc-700/40">otkazan</Legenda>
          </div>
        </>
      )}

      {odabrani && raspored && (
        <TerminRadnje
          termin={odabrani}
          ime={raspored.imena[odabrani.klijentId] ?? "Klijent"}
          onGotovo={gotovo}
          onZatvori={() => setOdabrani(null)}
        />
      )}
      {novi && (
        <NoviTermin datum={novi.datum} vrijeme={novi.vrijeme} onGotovo={gotovo} onZatvori={() => setNovi(null)} />
      )}
    </>
  );
}

function Legenda({ boja, children }: { boja: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded border ${boja}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export default function TrenerRasporedStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Zaglavlje />
        <TjedniRaspored />
      </Stranica>
    </Zasticeno>
  );
}
