"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Gumb, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { pocetnaZa, type Uloga } from "@/lib/tipovi";

/**
 * Prikazuje sadržaj samo korisniku s odgovarajućom ulogom.
 * Ovo je samo za snalaženje u aplikaciji – podatke stvarno štiti baza (RLS).
 */
export function Zasticeno({ uloga, children }: { uloga: Uloga; children: React.ReactNode }) {
  const { session, profil, ucitava, greska, pokusajPonovno, odjava } = useAuth();
  const router = useRouter();

  let preusmjeri: string | null = null;
  if (!ucitava && !greska) {
    if (!session) preusmjeri = "/prijava";
    else if (profil && profil.uloga !== uloga) preusmjeri = pocetnaZa(profil.uloga);
  }

  useEffect(() => {
    if (preusmjeri) router.replace(preusmjeri);
  }, [preusmjeri, router]);

  if (greska) {
    return (
      <Stranica>
        <Poruka tip="greska">{greska}</Poruka>
        {session && (
          <div className="grid grid-cols-2 gap-2">
            <Gumb malen onClick={pokusajPonovno}>
              Pokušaj ponovno
            </Gumb>
            <Gumb
              varijanta="sporedni"
              malen
              onClick={async () => {
                await odjava();
                router.replace("/prijava");
              }}
            >
              Odjava
            </Gumb>
          </div>
        )}
      </Stranica>
    );
  }
  if (ucitava || preusmjeri || !profil) return <Ucitavanje />;
  if (profil.uloga === "klijent" && !profil.aktivan) {
    return (
      <Stranica>
        <div className="flex flex-1 flex-col justify-center gap-4 py-16">
          <h1 className="text-2xl font-bold">Račun je u arhivi</h1>
          <p className="text-tekst-2">
            Trener je tvoj račun stavio u arhivu. Svi tvoji podaci su spremljeni. Ako se vraćaš na treninge, javi se treneru
            i on će te vratiti jednim dodirom.
          </p>
          <Gumb
            varijanta="sporedni"
            onClick={async () => {
              await odjava();
              router.replace("/prijava");
            }}
          >
            Odjava
          </Gumb>
        </div>
      </Stranica>
    );
  }
  return <>{children}</>;
}
