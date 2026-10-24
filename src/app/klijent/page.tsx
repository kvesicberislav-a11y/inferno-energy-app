"use client";

import { useAuth } from "@/components/AuthProvider";
import { Prehrana } from "@/components/prehrana/Prehrana";
import { UputaInstalacije } from "@/components/UputaInstalacije";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Stranica } from "@/components/ui";

function KlijentPocetna() {
  const { profil } = useAuth();
  if (!profil) return null;
  const ime = profil.ime.split(" ")[0] || "";

  return (
    <Stranica>
      <Zaglavlje />
      <h1 className="pt-1 text-2xl font-bold">Bok{ime ? `, ${ime}` : ""}! 👋</h1>
      <UputaInstalacije />
      <Prehrana klijentId={profil.id} mozeUredivati />
    </Stranica>
  );
}

export default function KlijentStranica() {
  return (
    <Zasticeno uloga="klijent">
      <KlijentPocetna />
    </Zasticeno>
  );
}
