"use client";

import { useAuth } from "@/components/AuthProvider";
import { MojiTermini } from "@/components/raspored/MojiTermini";
import { DanasnjiTrening } from "@/components/trening/DanasnjiTrening";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Stranica } from "@/components/ui";

function KlijentTrening() {
  const { profil } = useAuth();
  if (!profil) return null;
  return (
    <Stranica>
      <Zaglavlje />
      <MojiTermini klijentId={profil.id} />
      <DanasnjiTrening klijentId={profil.id} />
    </Stranica>
  );
}

export default function KlijentTreningStranica() {
  return (
    <Zasticeno uloga="klijent">
      <KlijentTrening />
    </Zasticeno>
  );
}
