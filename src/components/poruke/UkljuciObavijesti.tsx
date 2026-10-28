"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Gumb, Poruka } from "@/components/ui";
import { stanjeObavijesti, ukljuciObavijesti, type StanjeObavijesti } from "@/lib/obavijesti";
import type { Uloga } from "@/lib/tipovi";

const KLJUC_SKRIVENO = "inferno-obavijesti-skrivene";
const bezPretplate = () => () => {};

function jeSkrivena() {
  try {
    return localStorage.getItem(KLJUC_SKRIVENO) === "1";
  } catch {
    return false;
  }
}

/**
 * Poziv da korisnik uključi obavijesti na mobitelu.
 * - "pocetna": mala kartica koja se može sakriti (samo dok obavijesti nisu uključene)
 * - "poruke": uvijek objasni stanje (npr. blokirano ili iPhone bez početnog zaslona)
 */
export function UkljuciObavijesti({ uloga, mjesto }: { uloga: Uloga; mjesto: "pocetna" | "poruke" }) {
  const pocetno = useSyncExternalStore(bezPretplate, stanjeObavijesti, (): StanjeObavijesti => "nepoznato");
  const skrivenaNaPocetku = useSyncExternalStore(bezPretplate, jeSkrivena, () => true);
  const [promijenjeno, setPromijenjeno] = useState<StanjeObavijesti | null>(null);
  const [skrivena, setSkrivena] = useState(false);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const stanje = promijenjeno ?? pocetno;
  const odKoga = uloga === "klijent" ? "trener" : "klijent";

  async function ukljuci() {
    setRadi(true);
    setGreska(null);
    const g = await ukljuciObavijesti();
    setRadi(false);
    setGreska(g);
    setPromijenjeno(stanjeObavijesti());
  }

  function sakrij() {
    try {
      localStorage.setItem(KLJUC_SKRIVENO, "1");
    } catch {
      // nije bitno
    }
    setSkrivena(true);
  }

  if (stanje === "nepoznato" || stanje === "nepodrzano") return null;

  if (stanje === "ukljuceno") {
    if (greska) return <Poruka tip="greska">{greska}</Poruka>;
    return promijenjeno && mjesto === "poruke" ? (
      <Poruka tip="uspjeh">🔔 Obavijesti su uključene. Mobitel će ti javiti kad stigne nova poruka.</Poruka>
    ) : null;
  }

  if (mjesto === "pocetna") {
    // Na početnoj samo poziv za uključivanje; ostala objašnjenja su na stranici Poruke
    if (stanje !== "iskljuceno" || skrivena || skrivenaNaPocetku) return null;
  }

  if (stanje === "ios-instaliraj") {
    return (
      <Poruka>
        🔔 Da ti iPhone javi kad ti {odKoga} napiše poruku, aplikaciju prvo dodaj na početni zaslon.{" "}
        <Link href="/instaliraj" className="font-semibold text-vatra">
          Kako? ›
        </Link>
      </Poruka>
    );
  }

  if (stanje === "blokirano") {
    return (
      <Poruka>
        🔕 Obavijesti su isključene za ovu aplikaciju. Uključi ih u postavkama mobitela (Postavke → Obavijesti) ili u
        postavkama preglednika za ovu stranicu.
      </Poruka>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-vatra/40 bg-vatra/10 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden="true">
          🔔
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Uključi obavijesti</p>
          <p className="mt-1 text-sm text-tekst-2">Mobitel će ti javiti kad ti {odKoga} pošalje poruku.</p>
        </div>
        {mjesto === "pocetna" && (
          <button
            type="button"
            onClick={sakrij}
            aria-label="Sakrij"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tekst-2"
          >
            ✕
          </button>
        )}
      </div>
      <Gumb malen onClick={ukljuci} disabled={radi}>
        {radi ? "Uključujem…" : "Uključi obavijesti"}
      </Gumb>
      {greska && <Poruka tip="greska">{greska}</Poruka>}
    </div>
  );
}
