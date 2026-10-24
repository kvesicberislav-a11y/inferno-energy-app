"use client";

import { useState } from "react";
import { DodatniTermin } from "@/components/raspored/DodatniTermin";
import { PopisTermina } from "@/components/raspored/PopisTermina";
import { TerminRadnje } from "@/components/raspored/TerminRadnje";
import { useRaspored } from "@/components/raspored/useRaspored";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Gumb, Kartica, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { danMjesec, danasZagreb, dodajDane, ponedjeljak } from "@/lib/datum";
import type { Termin } from "@/lib/raspored";

function TjedniRaspored() {
  const danas = danasZagreb();
  const [pon, setPon] = useState(() => ponedjeljak(danasZagreb()));
  const ned = dodajDane(pon, 6);
  const { raspored, osvjezi } = useRaspored(null, pon, ned);
  const [odabrani, setOdabrani] = useState<Termin | null>(null);
  const [dodatni, setDodatni] = useState(false);
  const [obavijest, setObavijest] = useState<string | null>(null);

  function gotovo(poruka: string) {
    setOdabrani(null);
    setDodatni(false);
    setObavijest(poruka);
    osvjezi();
  }

  const aktivni = raspored?.termini.filter((t) => !t.otkazan).length ?? 0;
  const brojKlijenata = raspored ? new Set(raspored.termini.filter((t) => !t.otkazan).map((t) => t.klijentId)).size : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl font-bold">Raspored</h1>
        <Gumb malen onClick={() => setDodatni(true)}>
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
          <span className="text-lg font-bold">{pon === ponedjeljak(danas) ? "Ovaj tjedan" : "Tjedan"}</span>
          <span className="text-sm text-tekst-2">
            {danMjesec(pon)} – {danMjesec(ned)}
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
        <Kartica className="flex flex-col gap-3">
          {raspored.greska && <Poruka tip="greska">{raspored.greska}</Poruka>}
          <p className="text-sm text-tekst-2">
            {aktivni} {aktivni === 1 ? "termin" : "termina"} · {brojKlijenata}{" "}
            {brojKlijenata === 1 ? "klijent" : "klijenata"}
          </p>
          <PopisTermina
            termini={raspored.termini}
            imena={raspored.imena}
            prikaziIme
            onOdabir={setOdabrani}
            prazno="Ovaj tjedan nema termina. Stalne termine postavljaš na stranici klijenta (kartica Treninzi)."
          />
        </Kartica>
      )}

      {odabrani && raspored && (
        <TerminRadnje
          termin={odabrani}
          ime={raspored.imena[odabrani.klijentId] ?? "Klijent"}
          onGotovo={gotovo}
          onZatvori={() => setOdabrani(null)}
        />
      )}
      {dodatni && (
        <DodatniTermin
          klijentId={null}
          pocetniDatum={pon > danas ? pon : danas}
          onGotovo={gotovo}
          onZatvori={() => setDodatni(false)}
        />
      )}
    </>
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
