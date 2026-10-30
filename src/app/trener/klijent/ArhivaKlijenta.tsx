"use client";

import { useState } from "react";
import { Gumb, Poruka } from "@/components/ui";
import { formatDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

/** Arhiviraj klijenta koji je prestao trenirati (ili ga vrati iz arhive). */
export function ArhivaKlijenta({
  klijentId,
  ime,
  arhivirano,
  onPromjena,
}: {
  klijentId: string;
  ime: string;
  /** kad je arhiviran, ili null ako je aktivan */
  arhivirano: string | null;
  onPromjena: (arhivirano: string | null) => void;
}) {
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  async function promijeni(arhiviraj: boolean) {
    if (
      arhiviraj &&
      !window.confirm(
        `Arhivirati klijenta ${ime}?\n\n` +
          "• neće se moći prijaviti u aplikaciju\n" +
          "• stalni termini mu se ukidaju\n" +
          "• nestaje s popisa klijenata i iz grupnih poruka\n\n" +
          "Svi podaci ostaju spremljeni i vraćaš ga jednim dodirom.",
      )
    ) {
      return;
    }
    setGreska(null);
    setRadi(true);
    const { error } = await supabase().rpc("arhiviraj_klijenta", { p_klijent: klijentId, p_arhiviraj: arhiviraj });
    setRadi(false);
    if (error) return setGreska(prevediGresku(error.message));
    onPromjena(arhiviraj ? new Date().toISOString() : null);
  }

  if (arhivirano) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
        <p className="font-semibold text-amber-100">U arhivi od {formatDatum(arhivirano)}</p>
        <p className="text-sm text-amber-100/80">
          Klijent se ne može prijaviti. Podaci su spremljeni. Kad ga vratiš, ponovno dodaj termine.
        </p>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb malen onClick={() => promijeni(false)} disabled={radi}>
          {radi ? "…" : "Vrati iz arhive"}
        </Gumb>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-rub pt-5">
      {greska && <Poruka tip="greska">{greska}</Poruka>}
      <Gumb varijanta="sporedni" onClick={() => promijeni(true)} disabled={radi}>
        {radi ? "…" : "Arhiviraj klijenta"}
      </Gumb>
      <p className="text-center text-xs text-tekst-2">Za klijente koji su prestali trenirati. Možeš ga vratiti kad god.</p>
    </div>
  );
}
