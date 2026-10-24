import { Suspense } from "react";
import { Stranica, Ucitavanje } from "@/components/ui";
import { NovaLozinkaForma } from "./NovaLozinkaForma";

export default function NovaLozinkaStranica() {
  return (
    <Stranica>
      <Suspense fallback={<Ucitavanje />}>
        <NovaLozinkaForma />
      </Suspense>
    </Stranica>
  );
}
