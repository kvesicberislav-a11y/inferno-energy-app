"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/Logo";
import { Navigacija } from "@/components/Navigacija";
import { Gumb } from "@/components/ui";
import { iskljuciNaOvomUredaju } from "@/lib/obavijesti";

export function Zaglavlje() {
  const { odjava, profil } = useAuth();
  const router = useRouter();
  const [odjavljuje, setOdjavljuje] = useState(false);

  async function odjaviSe() {
    setOdjavljuje(true);
    // ovaj mobitel više ne prima obavijesti (najviše 3 s čekanja, odjava uvijek prolazi)
    await Promise.race([iskljuciNaOvomUredaju(), new Promise((r) => setTimeout(r, 3000))]);
    await odjava();
    router.replace("/prijava");
  }

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Logo />
        <Gumb varijanta="sporedni" malen onClick={odjaviSe} disabled={odjavljuje}>
          Odjava
        </Gumb>
      </div>
      {profil && <Navigacija uloga={profil.uloga} />}
    </header>
  );
}
