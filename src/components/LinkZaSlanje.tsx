"use client";

import { useState } from "react";
import { Gumb } from "@/components/ui";

/** Prikazuje link i gumbe za kopiranje i slanje WhatsAppom. */
export function LinkZaSlanje({ link, poruka }: { link: string; poruka: string }) {
  const [kopirano, setKopirano] = useState(false);

  async function kopiraj() {
    try {
      await navigator.clipboard.writeText(link);
      setKopirano(true);
      setTimeout(() => setKopirano(false), 2000);
    } catch {
      window.prompt("Kopiraj link:", link);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="break-all rounded-2xl border border-rub bg-pozadina px-4 py-3 text-sm text-tekst-2 select-all">
        {link}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Gumb varijanta="sporedni" malen onClick={kopiraj}>
          {kopirano ? "Kopirano ✓" : "Kopiraj link"}
        </Gumb>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(poruka)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#25D366] px-4 text-base font-semibold text-black transition active:scale-[0.98]"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
