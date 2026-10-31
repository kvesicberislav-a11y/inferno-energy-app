"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gumb, Poruka } from "@/components/ui";
import { ocistiPlanoveBezTermina } from "@/components/raspored/useRaspored";
import { danasZagreb, formatDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

/** Arhiviraj klijenta koji je prestao trenirati (ili ga vrati iz arhive), ili ga trajno obriši. */
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
  const router = useRouter();
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  async function obrisiTrajno() {
    if (
      !window.confirm(
        `Jesi siguran? Trajno obrisati klijenta ${ime}?

` +
          "Briše se sve: treninzi, prehrana, mjerenja, slike, poruke, termini i račun. Ovo se ne može poništiti.",
      )
    ) {
      return;
    }
    setGreska(null);
    setRadi(true);
    const sb = supabase();
    const { data, error } = await sb.rpc("obrisi_klijenta", { p_klijent: klijentId });
    if (error) {
      setRadi(false);
      return setGreska(prevediGresku(error.message));
    }
    // slike napretka iz spremišta (podaci su već obrisani, pa greška ovdje ne smeta)
    const slike = (data as string[] | null) ?? [];
    if (slike.length) await sb.storage.from("napredak").remove(slike).catch(() => undefined);
    router.replace("/trener");
  }

  const brisanje = (
    <>
      <Gumb varijanta="opasni" malen onClick={obrisiTrajno} disabled={radi}>
        Obriši trajno
      </Gumb>
      <p className="text-center text-xs text-tekst-2">Briše klijenta i sve njegove podatke. Ne može se poništiti.</p>
    </>
  );

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
    // prazni planovi budućih treninga (termini su ukinuti) se brišu
    if (arhiviraj) await ocistiPlanoveBezTermina(klijentId, danasZagreb()).catch(() => undefined);
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
        {brisanje}
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
      <div className="mt-3 flex flex-col gap-2">{brisanje}</div>
    </div>
  );
}
