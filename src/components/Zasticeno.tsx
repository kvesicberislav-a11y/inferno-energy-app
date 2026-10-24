"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { pocetnaZa, type Uloga } from "@/lib/tipovi";

/**
 * Prikazuje sadržaj samo korisniku s odgovarajućom ulogom.
 * Ovo je samo za snalaženje u aplikaciji – podatke stvarno štiti baza (RLS).
 */
export function Zasticeno({ uloga, children }: { uloga: Uloga; children: React.ReactNode }) {
  const { session, profil, ucitava, greska } = useAuth();
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
      </Stranica>
    );
  }
  if (ucitava || preusmjeri || !profil) return <Ucitavanje />;
  return <>{children}</>;
}
