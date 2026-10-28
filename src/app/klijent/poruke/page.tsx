"use client";

import { useAuth } from "@/components/AuthProvider";
import { Razgovor } from "@/components/poruke/Razgovor";
import { UkljuciObavijesti } from "@/components/poruke/UkljuciObavijesti";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Stranica } from "@/components/ui";

function KlijentPoruke() {
  const { profil } = useAuth();
  if (!profil) return null;
  return (
    <Stranica>
      <Zaglavlje />
      <div>
        <h1 className="text-2xl font-bold">Poruke</h1>
        <p className="text-tekst-2">Dopisivanje s trenerom</p>
      </div>
      <UkljuciObavijesti uloga="klijent" mjesto="poruke" />
      <Razgovor klijentId={profil.id} jaSamTrener={false} />
    </Stranica>
  );
}

export default function KlijentPorukeStranica() {
  return (
    <Zasticeno uloga="klijent">
      <KlijentPoruke />
    </Zasticeno>
  );
}
