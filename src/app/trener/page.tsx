"use client";

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
        <KlijentiIPozivnice />
      </Stranica>
    </Zasticeno>
  );
}
