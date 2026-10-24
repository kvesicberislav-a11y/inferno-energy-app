"use client";

import { useAuth } from "@/components/AuthProvider";
import { NapredakPrikaz } from "@/components/napredak/NapredakPrikaz";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Stranica } from "@/components/ui";

function KlijentNapredak() {
  const { profil } = useAuth();
  if (!profil) return null;
  return (
    <Stranica>
      <Zaglavlje />
      <NapredakPrikaz klijentId={profil.id} jeKlijent />
    </Stranica>
  );
}

export default function KlijentNapredakStranica() {
  return (
    <Zasticeno uloga="klijent">
      <KlijentNapredak />
    </Zasticeno>
  );
}
