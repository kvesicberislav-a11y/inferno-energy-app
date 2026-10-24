import { Suspense } from "react";
import { Stranica, Ucitavanje } from "@/components/ui";
import { RegistracijaForma } from "./RegistracijaForma";

export default function PozivnicaStranica() {
  return (
    <Stranica>
      <Suspense fallback={<Ucitavanje />}>
        <RegistracijaForma />
      </Suspense>
    </Stranica>
  );
}
