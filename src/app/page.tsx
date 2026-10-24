"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { pocetnaZa } from "@/lib/tipovi";

/** Početna adresa: šalje korisnika na prijavu ili na njegov dio aplikacije. */
export default function Pocetna() {
  const { session, profil, ucitava, greska } = useAuth();
  const router = useRouter();

  let cilj: string | null = null;
  if (!ucitava && !greska) {
    if (!session) cilj = "/prijava";
    else if (profil) cilj = pocetnaZa(profil.uloga);
  }

  useEffect(() => {
    if (cilj) router.replace(cilj);
  }, [cilj, router]);

  if (greska) {
    return (
      <Stranica>
        <Poruka tip="greska">{greska}</Poruka>
      </Stranica>
    );
  }
  return <Ucitavanje />;
}
