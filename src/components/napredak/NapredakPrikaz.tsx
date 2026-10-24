"use client";

import { useState } from "react";
import { Gumb, Kartica, Poruka, Ucitavanje } from "@/components/ui";
import { danasZagreb, puniDatum } from "@/lib/datum";
import { MJERE, format1, type Mjerenje } from "@/lib/tijelo";
import { MjereForma, OsobniPodaciForma } from "./Forme";
import { GrafoviNapretka } from "./GrafoviNapretka";
import { SazetakTijela } from "./SazetakTijela";
import { SlikeNapretka } from "./SlikeNapretka";
import { useTijelo } from "./useTijelo";

/**
 * Napredak klijenta: stanje tijela, mjere, grafovi, pridržavanje i slike.
 * Klijent sve unosi; trener vidi isto i smije ispraviti osobne podatke.
 */
export function NapredakPrikaz({ klijentId, jeKlijent }: { klijentId: string; jeKlijent: boolean }) {
  const { stanje, osvjezi } = useTijelo(klijentId);
  const [osobniOtvoreno, setOsobniOtvoreno] = useState(false);
  const [mjere, setMjere] = useState<{ datum: string } | null>(null);
  const [svaMjerenja, setSvaMjerenja] = useState(false);

  if (!stanje) return <Ucitavanje />;
  if (stanje.greska) return <Poruka tip="greska">{stanje.greska}</Poruka>;

  const zadnjaMjerenja = [...stanje.mjerenja].reverse();
  const prikazana = svaMjerenja ? zadnjaMjerenja : zadnjaMjerenja.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <SazetakTijela osobni={stanje.osobni} mjerenja={stanje.mjerenja} onOsobni={() => setOsobniOtvoreno(true)} />

      {jeKlijent && <Gumb onClick={() => setMjere({ datum: danasZagreb() })}>+ Unesi mjere</Gumb>}

      <GrafoviNapretka klijentId={klijentId} mjerenja={stanje.mjerenja} kreirano={stanje.kreirano} />

      <SlikeNapretka klijentId={klijentId} jeKlijent={jeKlijent} />

      <Kartica className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Povijest mjera</h3>
        {prikazana.length === 0 ? (
          <p className="text-sm text-tekst-2">Još nema unesenih mjera.</p>
        ) : (
          prikazana.map((m) => (
            <RedMjerenja
              key={m.id}
              m={m}
              onClick={jeKlijent ? () => setMjere({ datum: m.datum }) : undefined}
            />
          ))
        )}
        {zadnjaMjerenja.length > 5 && (
          <button type="button" onClick={() => setSvaMjerenja((s) => !s)} className="self-start text-sm text-tekst-2 underline">
            {svaMjerenja ? "Prikaži manje" : `Prikaži sve (${zadnjaMjerenja.length})`}
          </button>
        )}
      </Kartica>

      {osobniOtvoreno && (
        <OsobniPodaciForma
          klijentId={klijentId}
          pocetno={stanje.osobni}
          onZatvori={() => setOsobniOtvoreno(false)}
          onSpremljeno={() => {
            setOsobniOtvoreno(false);
            osvjezi();
          }}
        />
      )}

      {mjere && (
        <MjereForma
          mjerenja={stanje.mjerenja}
          pocetniDatum={mjere.datum}
          onZatvori={() => setMjere(null)}
          onSpremljeno={() => {
            setMjere(null);
            osvjezi();
          }}
        />
      )}
    </div>
  );
}

function RedMjerenja({ m, onClick }: { m: Mjerenje; onClick?: () => void }) {
  const vrijednosti = MJERE.filter((mj) => m[mj.kljuc] !== null).map(
    (mj) => `${mj.oznaka} ${format1(m[mj.kljuc]!)} ${mj.jedinica}`,
  );
  const sadrzaj = (
    <>
      <span className="font-semibold">{puniDatum(m.datum)}</span>
      <span className="text-sm text-tekst-2">{vrijednosti.join(" · ")}</span>
    </>
  );
  const stil = "flex w-full flex-col gap-0.5 rounded-2xl border border-rub bg-povrsina-2 px-3 py-2.5 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${stil} active:scale-[0.99]`}>
      {sadrzaj}
    </button>
  ) : (
    <div className={stil}>{sadrzaj}</div>
  );
}
