"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Cip, Gumb, Kartica, Poruka, Stranica } from "@/components/ui";

type Platforma = "iphone" | "android" | "racunalo" | "nepoznato";
type DogadajInstalacije = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function dohvatiPlatformu(): Platforma {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "racunalo";
}

function jeInstalirana() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const bezPretplate = () => () => {};

/* ---------- male ikone kakve korisnik vidi na mobitelu ---------- */
function IkonaDijeli() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-6 w-6 align-[-6px] text-sky-400" fill="none" stroke="currentColor" strokeWidth="2" aria-label="ikona Dijeli">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" strokeLinecap="round" />
    </svg>
  );
}
function IkonaDodaj() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-6 w-6 align-[-6px] text-tekst" fill="none" stroke="currentColor" strokeWidth="2" aria-label="ikona Dodaj">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}
function IkonaIzbornik() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-povrsina-2 align-[-4px] text-lg font-bold leading-none" aria-label="ikona izbornika">
      ⋮
    </span>
  );
}

function Korak({ broj, children }: { broj: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-r from-vatra to-vatra-2 font-bold text-white">
        {broj}
      </span>
      <div className="pt-1 text-base leading-relaxed">{children}</div>
    </li>
  );
}

/** Javna stranica s uputama kako dodati aplikaciju na početni zaslon (link šalje trener). */
export default function InstalirajStranica() {
  const platforma = useSyncExternalStore(bezPretplate, dohvatiPlatformu, (): Platforma => "nepoznato");
  const instalirana = useSyncExternalStore(bezPretplate, jeInstalirana, () => false);
  const [odabrana, setOdabrana] = useState<"iphone" | "android" | null>(null);
  const [dogadaj, setDogadaj] = useState<DogadajInstalacije | null>(null);
  const [gotovo, setGotovo] = useState(false);

  // Android/Chrome nudi instalaciju jednim dodirom
  useEffect(() => {
    const naPonudu = (e: Event) => {
      e.preventDefault();
      setDogadaj(e as DogadajInstalacije);
    };
    const naInstalaciju = () => setGotovo(true);
    window.addEventListener("beforeinstallprompt", naPonudu);
    window.addEventListener("appinstalled", naInstalaciju);
    return () => {
      window.removeEventListener("beforeinstallprompt", naPonudu);
      window.removeEventListener("appinstalled", naInstalaciju);
    };
  }, []);

  async function instaliraj() {
    if (!dogadaj) return;
    await dogadaj.prompt();
    const izbor = await dogadaj.userChoice;
    if (izbor.outcome === "accepted") setGotovo(true);
    setDogadaj(null);
  }

  const prikaz: "iphone" | "android" = odabrana ?? (platforma === "android" ? "android" : "iphone");

  return (
    <Stranica>
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <Logo velik />
        <h1 className="text-2xl font-bold">Dodaj aplikaciju na početni zaslon</h1>
        <p className="text-tekst-2">
          Tako se otvara jednim dodirom, preko cijelog zaslona – kao prava aplikacija. Ništa se ne preuzima iz trgovine.
        </p>
      </div>

      {platforma === "nepoznato" ? (
        // dok preglednik ne kaže koji je mobitel (djelić sekunde) – bez bljeskanja krivih uputa
        <div className="h-64" aria-hidden="true" />
      ) : instalirana || gotovo ? (
        <Kartica className="flex flex-col items-center gap-3 text-center">
          <p className="text-xl font-bold">✓ Aplikacija je dodana!</p>
          <p className="text-tekst-2">Otvaraj je s ikone s plamenom na početnom zaslonu.</p>
          <Link
            href="/prijava"
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-linear-to-r from-vatra to-vatra-2 text-lg font-semibold text-white"
          >
            Otvori i prijavi se
          </Link>
        </Kartica>
      ) : (
        <>
          {platforma === "racunalo" && (
            <Poruka>Ovaj link otvori na <strong>mobitelu</strong> – tamo se aplikacija dodaje na početni zaslon.</Poruka>
          )}

          {dogadaj && (
            <Kartica className="flex flex-col gap-3">
              <p className="font-semibold">Najbrže: jedan dodir</p>
              <Gumb onClick={instaliraj}>Dodaj na početni zaslon</Gumb>
            </Kartica>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Cip aktivan={prikaz === "iphone"} className="h-12 text-base" onClick={() => setOdabrana("iphone")}>
              iPhone
            </Cip>
            <Cip aktivan={prikaz === "android"} className="h-12 text-base" onClick={() => setOdabrana("android")}>
              Android
            </Cip>
          </div>

          {prikaz === "iphone" ? (
            <Kartica className="flex flex-col gap-4">
              <ol className="flex flex-col gap-4">
                <Korak broj={1}>
                  Otvori ovu stranicu u <strong>Safariju</strong>. Ako si link otvorio iz WhatsAppa ili Instagrama, prvo
                  dodirni <strong>„Otvori u Safariju”</strong> (ikona kompasa).
                </Korak>
                <Korak broj={2}>
                  Dodirni gumb <strong>Dijeli</strong> <IkonaDijeli /> (kvadrat sa strelicom prema gore). Na novijim
                  iPhoneima prvo dodirni <strong>•••</strong> pa <strong>Dijeli</strong>.
                </Korak>
                <Korak broj={3}>
                  Pomakni popis prema dolje i dodirni <strong>„Dodaj na početni zaslon”</strong> <IkonaDodaj />.
                </Korak>
                <Korak broj={4}>
                  Dodirni <strong>„Dodaj”</strong> gore desno. Gotovo!
                </Korak>
              </ol>
            </Kartica>
          ) : (
            <Kartica className="flex flex-col gap-4">
              <ol className="flex flex-col gap-4">
                <Korak broj={1}>
                  Otvori ovu stranicu u <strong>Chromeu</strong>. Ako si link otvorio iz WhatsAppa, dodirni <IkonaIzbornik />{" "}
                  pa <strong>„Otvori u Chromeu”</strong>.
                </Korak>
                <Korak broj={2}>
                  Dodirni <IkonaIzbornik /> gore desno.
                </Korak>
                <Korak broj={3}>
                  Dodirni <strong>„Instaliraj aplikaciju”</strong> ili <strong>„Dodaj na početni zaslon”</strong>.
                </Korak>
                <Korak broj={4}>
                  Potvrdi s <strong>„Instaliraj”</strong> (ili „Dodaj”). Gotovo!
                </Korak>
              </ol>
              <p className="text-sm text-tekst-2">
                Samsung preglednik: izbornik ≡ → „Dodaj stranicu u” → „Početni zaslon”.
              </p>
            </Kartica>
          )}

          <Kartica className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- mala statična ikona */}
            <img src="/ikone/ikona-192.png" alt="" className="h-16 w-16 rounded-2xl" />
            <p className="text-tekst-2">
              Na početnom zaslonu tražiš ovu ikonu s natpisom <strong className="text-tekst">INFERNO</strong>.
            </p>
          </Kartica>

          <Link href="/prijava" className="py-2 text-center text-base font-medium text-vatra">
            Preskoči i otvori prijavu ›
          </Link>
        </>
      )}
    </Stranica>
  );
}
