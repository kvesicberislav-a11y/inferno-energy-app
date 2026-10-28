"use client";

import { UkljuciObavijesti } from "@/components/poruke/UkljuciObavijesti";
import { UputaInstalacije } from "@/components/UputaInstalacije";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Stranica } from "@/components/ui";
import { KlijentiIPozivnice } from "./KlijentiIPozivnice";

export default function TrenerStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Zaglavlje />
        <UputaInstalacije />
        <UkljuciObavijesti uloga="trener" mjesto="pocetna" />
        <KlijentiIPozivnice />
      </Stranica>
    </Zasticeno>
  );
}
