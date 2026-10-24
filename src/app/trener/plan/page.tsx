"use client";

import { Suspense } from "react";
import { Zasticeno } from "@/components/Zasticeno";
import { Stranica, Ucitavanje } from "@/components/ui";
import { UredivacPlana } from "./UredivacPlana";

export default function TrenerPlanStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Suspense fallback={<Ucitavanje />}>
          <UredivacPlana />
        </Suspense>
      </Stranica>
    </Zasticeno>
  );
}
