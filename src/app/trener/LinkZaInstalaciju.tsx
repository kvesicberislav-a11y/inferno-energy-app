"use client";

import { useState } from "react";
import { LinkZaSlanje } from "@/components/LinkZaSlanje";
import { Gumb, Kartica } from "@/components/ui";

/** Trener šalje bilo kome link s uputama za dodavanje aplikacije na početni zaslon. */
export function LinkZaInstalaciju() {
  const [otvoreno, setOtvoreno] = useState(false);

  if (!otvoreno) {
    return (
      <Gumb varijanta="sporedni" onClick={() => setOtvoreno(true)}>
        📲 Pošalji upute za početni zaslon
      </Gumb>
    );
  }

  const link = `${window.location.origin}/instaliraj`;
  return (
    <Kartica className="flex flex-col gap-3">
      <p className="text-lg font-semibold">Upute za početni zaslon</p>
      <p className="text-tekst-2">
        Pošalji ovaj link klijentu. Otvorit će mu se upute za njegov mobitel (iPhone ili Android) kako dodati
        aplikaciju na početni zaslon. Link je isti za sve i ne istječe.
      </p>
      <LinkZaSlanje
        link={link}
        poruka={`Bok! Ovdje su upute kako dodati INFERNO ENERGY aplikaciju na početni zaslon mobitela, da se otvara kao prava aplikacija:\n${link}`}
      />
      <Gumb varijanta="sporedni" malen onClick={() => setOtvoreno(false)}>
        Zatvori
      </Gumb>
    </Kartica>
  );
}
