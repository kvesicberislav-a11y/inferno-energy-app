"use client";

import { useEffect, useState } from "react";
import { Plamen } from "@/components/Logo";
import { Gumb } from "@/components/ui";

const KLJUC_SKRIVENO = "inferno-instalacija-skrivena";

type DogadajInstalacije = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function jeInstalirana() {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function jeIphone() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function jeSkrivena() {
  try {
    return localStorage.getItem(KLJUC_SKRIVENO) === "1";
  } catch {
    return false;
  }
}

/**
 * Poziv da se aplikacija doda na početni zaslon.
 * Android/Chrome: gumb "Instaliraj". iPhone: kratke upute (Dijeli → Dodaj na početni zaslon).
 * Ne prikazuje se ako je aplikacija već instalirana ili ju je korisnik sakrio.
 */
export function UputaInstalacije() {
  const [skrivena, setSkrivena] = useState(() => jeInstalirana() || jeSkrivena());
  const [iphone] = useState(jeIphone);
  const [dogadaj, setDogadaj] = useState<DogadajInstalacije | null>(null);

  useEffect(() => {
    const naPonudu = (e: Event) => {
      e.preventDefault();
      setDogadaj(e as DogadajInstalacije);
    };
    const naInstalaciju = () => setSkrivena(true);
    window.addEventListener("beforeinstallprompt", naPonudu);
    window.addEventListener("appinstalled", naInstalaciju);
    return () => {
      window.removeEventListener("beforeinstallprompt", naPonudu);
      window.removeEventListener("appinstalled", naInstalaciju);
    };
  }, []);

  function sakrij() {
    try {
      localStorage.setItem(KLJUC_SKRIVENO, "1");
    } catch {
      // nije bitno
    }
    setSkrivena(true);
  }

  async function instaliraj() {
    if (!dogadaj) return;
    await dogadaj.prompt();
    const izbor = await dogadaj.userChoice;
    if (izbor.outcome === "accepted") setSkrivena(true);
    setDogadaj(null);
  }

  if (skrivena || (!iphone && !dogadaj)) return null;

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-vatra/40 bg-vatra/10 p-4">
      <div className="flex items-start gap-3">
        <Plamen className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Dodaj aplikaciju na početni zaslon</p>
          {iphone ? (
            <p className="mt-1 text-sm text-tekst-2">
              U Safariju dodirni <strong className="text-tekst">Dijeli</strong>{" "}
              <span aria-hidden="true">(kvadrat sa strelicom ↑)</span>, zatim{" "}
              <strong className="text-tekst">„Dodaj na početni zaslon”</strong>.
            </p>
          ) : (
            <p className="mt-1 text-sm text-tekst-2">Otvarat će se kao prava aplikacija, preko cijelog zaslona.</p>
          )}
        </div>
        <button
          type="button"
          onClick={sakrij}
          aria-label="Sakrij"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tekst-2"
        >
          ✕
        </button>
      </div>
      {!iphone && dogadaj && (
        <Gumb malen onClick={instaliraj}>
          Instaliraj aplikaciju
        </Gumb>
      )}
    </div>
  );
}
