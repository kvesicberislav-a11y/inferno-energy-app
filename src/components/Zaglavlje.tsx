"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/Logo";
import { Gumb } from "@/components/ui";

export function Zaglavlje() {
  const { odjava } = useAuth();
  const router = useRouter();
  const [odjavljuje, setOdjavljuje] = useState(false);

  async function odjaviSe() {
    setOdjavljuje(true);
    await odjava();
    router.replace("/prijava");
  }

  return (
    <header className="flex items-center justify-between gap-3">
      <Logo />
      <Gumb varijanta="sporedni" malen onClick={odjaviSe} disabled={odjavljuje}>
        Odjava
      </Gumb>
    </header>
  );
}
