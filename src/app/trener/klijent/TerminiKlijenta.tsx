"use client";

import { useState } from "react";
import { DodatniTermin } from "@/components/raspored/DodatniTermin";
import { PopisTermina } from "@/components/raspored/PopisTermina";
import { TerminRadnje } from "@/components/raspored/TerminRadnje";
import { obavijestiKlijenta, useRaspored } from "@/components/raspored/useRaspored";
import { Cip, Gumb, Kartica, Poruka } from "@/components/ui";
import { danasZagreb, dodajDane } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { opisPravila, type Pravilo, type Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { DANI, DANI_KRATKO } from "@/lib/treninzi";

/** Trener: stalni tjedni termini klijenta i njegovi sljedeći termini. */
export function TerminiKlijenta({ klijentId, ime }: { klijentId: string; ime: string }) {
  const danas = danasZagreb();
  const doDana = dodajDane(danas, 13);
  const { raspored, osvjezi } = useRaspored(klijentId, danas, doDana);
  const [dodavanje, setDodavanje] = useState(false);
  const [dodatni, setDodatni] = useState(false);
  const [odabrani, setOdabrani] = useState<Termin | null>(null);
  const [obavijest, setObavijest] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  function gotovo(poruka: string) {
    setOdabrani(null);
    setDodatni(false);
    setDodavanje(false);
    setObavijest(poruka);
    osvjezi();
  }

  async function ukloni(p: Pravilo) {
    if (!window.confirm(`Ukinuti stalni termin: ${opisPravila(p)}?`)) return;
    setGreska(null);
    const { error } = await supabase().from("termini_pravila").delete().eq("id", p.id);
    if (error) return setGreska(prevediGresku(error.message));
    gotovo(await obavijestiKlijenta(klijentId, `Ukinut je stalni termin: ${opisPravila(p)}.`));
  }

  if (!raspored) {
    return (
      <Kartica>
        <p className="text-tekst-2">Učitavam termine…</p>
      </Kartica>
    );
  }

  return (
    <>
      <Kartica className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Termini s tobom</h3>
          <span className="text-sm text-tekst-2">
            {raspored.pravila.length}× tjedno
          </span>
        </div>

        {obavijest && <Poruka tip="uspjeh">{obavijest}</Poruka>}
        {(raspored.greska || greska) && <Poruka tip="greska">{raspored.greska ?? greska}</Poruka>}

        {raspored.pravila.length === 0 ? (
          <p className="text-sm text-tekst-2">Još nema stalnih termina.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...raspored.pravila]
              .sort((a, b) => a.dan_u_tjednu - b.dan_u_tjednu || a.vrijeme.localeCompare(b.vrijeme))
              .map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-rub bg-povrsina-2 px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {DANI[p.dan_u_tjednu - 1]} u {p.vrijeme}
                    </span>
                    <span className="text-xs text-tekst-2">
                      {p.trajanje_min} min{p.napomena ? ` · ${p.napomena}` : ""}
                    </span>
                  </span>
                  <button type="button" onClick={() => ukloni(p)} className="shrink-0 text-sm text-red-300">
                    Ukini
                  </button>
                </div>
              ))}
          </div>
        )}

        {dodavanje ? (
          <NoviStalniTermini klijentId={klijentId} onGotovo={gotovo} onOdustani={() => setDodavanje(false)} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Gumb varijanta="sporedni" malen onClick={() => setDodavanje(true)}>
              + Stalni termin
            </Gumb>
            <Gumb varijanta="sporedni" malen onClick={() => setDodatni(true)}>
              + Jednokratni
            </Gumb>
          </div>
        )}
      </Kartica>

      <Kartica className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Sljedeća 2 tjedna</h3>
        <p className="-mt-2 text-xs text-tekst-2">Dodirni termin za pomak ili otkazivanje.</p>
        <PopisTermina
          termini={raspored.termini}
          prikaziIme={false}
          onOdabir={setOdabrani}
          prazno="Nema termina u sljedeća 2 tjedna."
        />
      </Kartica>

      {odabrani && <TerminRadnje termin={odabrani} ime={ime} onGotovo={gotovo} onZatvori={() => setOdabrani(null)} />}
      {dodatni && <DodatniTermin klijentId={klijentId} onGotovo={gotovo} onZatvori={() => setDodatni(false)} />}
    </>
  );
}

function NoviStalniTermini({
  klijentId,
  onGotovo,
  onOdustani,
}: {
  klijentId: string;
  onGotovo: (poruka: string) => void;
  onOdustani: () => void;
}) {
  const [dani, setDani] = useState<number[]>([]);
  const [vrijeme, setVrijeme] = useState("18:00");
  const [trajanje, setTrajanje] = useState(60);
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  async function spremi() {
    if (dani.length === 0) return setGreska("Odaberi barem jedan dan.");
    if (!vrijeme) return setGreska("Odaberi vrijeme.");
    setGreska(null);
    setRadi(true);
    const redovi = [...dani].sort().map((d) => ({ klijent_id: klijentId, dan_u_tjednu: d, vrijeme, trajanje_min: trajanje }));
    const { error } = await supabase().from("termini_pravila").insert(redovi);
    if (error) {
      setRadi(false);
      return setGreska(prevediGresku(error.message));
    }
    const opis = redovi.map((r) => `${DANI[r.dan_u_tjednu - 1]} u ${vrijeme}`).join(", ");
    const poruka = await obavijestiKlijenta(klijentId, `Novi stalni termini (svaki tjedan): ${opis}.`);
    setRadi(false);
    onGotovo(poruka);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-vatra/40 p-3">
      <p className="text-sm font-semibold">Koje dane? ({dani.length}× tjedno)</p>
      <div className="grid grid-cols-7 gap-1">
        {DANI_KRATKO.map((d, i) => (
          <Cip
            key={d}
            aktivan={dani.includes(i + 1)}
            className="px-0"
            onClick={() => setDani((x) => (x.includes(i + 1) ? x.filter((y) => y !== i + 1) : [...x, i + 1]))}
          >
            {d}
          </Cip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-tekst-2">Vrijeme</span>
          <input
            type="time"
            value={vrijeme}
            onChange={(e) => setVrijeme(e.target.value)}
            className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none focus:border-vatra"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-tekst-2">Trajanje</span>
          <div className="grid grid-cols-3 gap-1">
            {[45, 60, 90].map((m) => (
              <Cip key={m} aktivan={trajanje === m} className="h-12 px-0" onClick={() => setTrajanje(m)}>
                {m}′
              </Cip>
            ))}
          </div>
        </div>
      </div>
      {greska && <Poruka tip="greska">{greska}</Poruka>}
      <div className="grid grid-cols-2 gap-2">
        <Gumb varijanta="sporedni" malen onClick={onOdustani} disabled={radi}>
          Odustani
        </Gumb>
        <Gumb malen onClick={spremi} disabled={radi}>
          {radi ? "…" : "Spremi"}
        </Gumb>
      </div>
    </div>
  );
}
