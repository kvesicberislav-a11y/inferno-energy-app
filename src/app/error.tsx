"use client";

import { Logo } from "@/components/Logo";
import { Gumb, Stranica } from "@/components/ui";

/** Prikazuje se ako se na stranici dogodi neočekivana greška. */
export default function Greska({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Stranica>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Logo velik />
        <h1 className="text-2xl font-bold">Nešto je pošlo po zlu</h1>
        <p className="text-tekst-2">Pokušaj ponovno. Ako se ponavlja, provjeri internet ili se javi treneru.</p>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Gumb onClick={() => reset()}>Pokušaj ponovno</Gumb>
          {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination -- namjerno potpuno ponovno učitavanje nakon greške */}
          <Gumb varijanta="sporedni" onClick={() => window.location.assign("/")}>
            Na početnu
          </Gumb>
        </div>
      </div>
    </Stranica>
  );
}
