"use client";

import { useAuth } from "@/components/AuthProvider";
import { MojiTermini } from "@/components/raspored/MojiTermini";
import { DanasnjiTrening } from "@/components/trening/DanasnjiTrening";
import { TreninziUzivo } from "@/components/trening/TreninziUzivo";
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
      {/* uživo: treninge slaže i upisuje trener u kalendaru; online: program po ciklusima */}
      {(profil.nacin ?? "uzivo") === "uzivo" ? (
        <TreninziUzivo klijentId={profil.id} />
      ) : (
        <DanasnjiTrening klijentId={profil.id} />
      )}
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
