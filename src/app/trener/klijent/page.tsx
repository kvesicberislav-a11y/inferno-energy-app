"use client";

import { Suspense } from "react";
import { Zasticeno } from "@/components/Zasticeno";
import { Stranica, Ucitavanje } from "@/components/ui";
import { KlijentDetalji } from "./KlijentDetalji";

export default function TrenerKlijentStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Suspense fallback={<Ucitavanje />}>
          <KlijentDetalji />
        </Suspense>
      </Stranica>
    </Zasticeno>
  );
}
