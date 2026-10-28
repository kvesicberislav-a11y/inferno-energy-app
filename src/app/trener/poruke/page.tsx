"use client";

import { Suspense } from "react";
import { Zasticeno } from "@/components/Zasticeno";
import { Stranica, Ucitavanje } from "@/components/ui";
import { TrenerPoruke } from "./TrenerPoruke";

export default function TrenerPorukeStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Suspense fallback={<Ucitavanje />}>
          <TrenerPoruke />
        </Suspense>
      </Stranica>
    </Zasticeno>
  );
}
