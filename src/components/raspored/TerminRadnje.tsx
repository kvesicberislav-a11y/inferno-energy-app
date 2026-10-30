"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka } from "@/components/ui";
import { danasZagreb, dodajDane } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { opisPravila, opisTermina, type Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { obavijestiKlijenta, ukiniPravilo } from "./useRaspored";

const POLJE =
  "h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none focus:border-vatra";

/** Trener: otkaži, pomakni ili vrati jedan termin. */
export function TerminRadnje({
  termin,
  ime,
  onGotovo,
  onZatvori,
}: {
  termin: Termin;
  ime: string;
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const [pomicanje, setPomicanje] = useState(false);
  const [noviDatum, setNoviDatum] = useState(termin.datum);
  const [novoVrijeme, setNovoVrijeme] = useState(termin.vrijeme);
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const sb = supabase();
  const izvorni = { datum: termin.izvorniDatum ?? termin.datum, vrijeme: termin.pravilo?.vrijeme ?? termin.vrijeme };

  async function izvrsi(akcija: () => PromiseLike<{ error: { message: string } | null }>, promjena: string) {
    setGreska(null);
    setRadi(true);
    const { error } = await akcija();
    if (error) {
      setRadi(false);
      return setGreska(prevediGresku(error.message));
    }
    const poruka = await obavijestiKlijenta(termin.klijentId, promjena);
    setRadi(false);
    onGotovo(poruka);
  }

  function otkazi() {
    if (!window.confirm(`Otkazati termin ${opisTermina(termin)}?`)) return;
    if (termin.pravilo) {
      return izvrsi(
        () =>
          sb
            .from("termini_iznimke")
            .upsert(
              { pravilo_id: termin.pravilo!.id, datum: izvorni.datum, otkazan: true, novi_datum: null, novo_vrijeme: null },
              { onConflict: "pravilo_id,datum" },
            ),
        `Otkazan je termin: ${opisTermina(termin)}.`,
      );
    }
    return izvrsi(
      () => sb.from("termini_dodatni").delete().eq("id", termin.dodatni!.id),
      `Otkazan je termin: ${opisTermina(termin)}.`,
    );
  }

  function pomakni() {
    if (!noviDatum || !novoVrijeme) return setGreska("Odaberi datum i vrijeme.");
    const novo = { datum: noviDatum, vrijeme: novoVrijeme };
    if (termin.pravilo) {
      if (noviDatum > dodajDane(izvorni.datum, 28)) {
        return setGreska("Stalni termin možeš pomaknuti najviše 4 tjedna. Za kasniji datum dodaj dodatni termin.");
      }
      return izvrsi(
        () =>
          sb
            .from("termini_iznimke")
            .upsert(
              {
                pravilo_id: termin.pravilo!.id,
                datum: izvorni.datum,
                otkazan: false,
                novi_datum: noviDatum,
                novo_vrijeme: novoVrijeme,
              },
              { onConflict: "pravilo_id,datum" },
            ),
        `Termin ${opisTermina(izvorni)} pomaknut je na ${opisTermina(novo)}.`,
      );
    }
    return izvrsi(
      () => sb.from("termini_dodatni").update({ datum: noviDatum, vrijeme: novoVrijeme }).eq("id", termin.dodatni!.id),
      `Termin ${opisTermina(termin)} pomaknut je na ${opisTermina(novo)}.`,
    );
  }

  async function ukiniStalni() {
    const p = termin.pravilo;
    if (!p || !window.confirm(`Ukinuti stalni termin: ${opisPravila(p)}? Prošli termini ostaju zapisani.`)) return;
    setGreska(null);
    setRadi(true);
    const g = await ukiniPravilo(p);
    if (g) {
      setRadi(false);
      return setGreska(g);
    }
    const poruka = await obavijestiKlijenta(termin.klijentId, `Ukinut je stalni termin: ${opisPravila(p)}.`);
    setRadi(false);
    onGotovo(poruka);
  }

  function vrati() {
    if (!termin.iznimka) return;
    return izvrsi(
      () => sb.from("termini_iznimke").delete().eq("id", termin.iznimka!.id),
      `Termin ${opisTermina(izvorni)} ipak ostaje u uobičajeno vrijeme.`,
    );
  }

  return (
    <Ploca naslov={ime} onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-povrsina-2 px-4 py-3">
          <p className={`text-lg font-semibold ${termin.otkazan ? "text-tekst-2 line-through" : ""}`}>
            {opisTermina(termin)}
          </p>
          <p className="text-sm text-tekst-2">
            {termin.trajanje} min · {termin.pravilo ? "stalni termin" : "dodatni termin"}
            {termin.otkazan ? " · otkazan" : termin.iznimka ? ` · pomaknut (bio ${opisTermina(izvorni)})` : ""}
          </p>
          {termin.napomena && <p className="mt-1 text-sm text-amber-200">{termin.napomena}</p>}
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}

        {pomicanje ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-tekst-2">Novi datum</span>
                <input
                  type="date"
                  min={danasZagreb()}
                  // stalni termin se može pomaknuti najviše 4 tjedna (dalje bi nestao iz rasporeda)
                  max={termin.pravilo ? dodajDane(izvorni.datum, 28) : undefined}
                  value={noviDatum}
                  onChange={(e) => setNoviDatum(e.target.value)}
                  className={POLJE}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-tekst-2">Novo vrijeme</span>
                <input type="time" value={novoVrijeme} onChange={(e) => setNovoVrijeme(e.target.value)} className={POLJE} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Gumb varijanta="sporedni" onClick={() => setPomicanje(false)} disabled={radi}>
                Odustani
              </Gumb>
              <Gumb onClick={pomakni} disabled={radi}>
                {radi ? "…" : "Pomakni"}
              </Gumb>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {!termin.otkazan && (
              <Gumb varijanta="sporedni" onClick={() => setPomicanje(true)} disabled={radi}>
                Pomakni termin
              </Gumb>
            )}
            {termin.iznimka && (
              <Gumb varijanta="sporedni" onClick={vrati} disabled={radi}>
                {termin.otkazan ? "Vrati termin (ipak se održava)" : "Vrati na uobičajeno vrijeme"}
              </Gumb>
            )}
            {!termin.otkazan && (
              <Gumb varijanta="opasni" onClick={otkazi} disabled={radi}>
                {termin.pravilo ? "Otkaži samo ovaj termin" : "Otkaži (obriši) dodatni termin"}
              </Gumb>
            )}
            {termin.pravilo && (termin.pravilo.do_datuma === null || termin.pravilo.do_datuma >= danasZagreb()) && (
              <Gumb varijanta="opasni" onClick={ukiniStalni} disabled={radi}>
                Ukini stalni termin (svaki tjedan)
              </Gumb>
            )}
          </div>
        )}
      </div>
    </Ploca>
  );
}
