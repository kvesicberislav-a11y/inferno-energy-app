"use client";

import { useEffect, useState } from "react";
import { osvjeziPretplatuJednom } from "@/lib/obavijesti";
import { brojNeprocitanih, DOGADAJ_PROCITANO } from "@/lib/poruke";
import { supabase } from "@/lib/supabase/client";
import type { Uloga } from "@/lib/tipovi";

/** Broj nepročitanih poruka za izbornik – osvježava se čim stigne ili se pročita poruka. */
export function useNeprocitane(uloga: Uloga) {
  const [broj, setBroj] = useState(0);

  useEffect(() => {
    let aktivno = true;
    const osvjezi = () =>
      brojNeprocitanih(uloga).then((n) => {
        if (aktivno) setBroj(n);
      });
    void osvjezi();
    // ako su obavijesti dopuštene, ovaj uređaj ostaje prijavljen za njih
    osvjeziPretplatuJednom();

    const sb = supabase();
    const kanal = sb
      .channel(`neprocitane-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poruke" }, () => void osvjezi())
      .subscribe();
    const naVidljivost = () => {
      if (document.visibilityState === "visible") void osvjezi();
    };
    document.addEventListener("visibilitychange", naVidljivost);
    window.addEventListener(DOGADAJ_PROCITANO, osvjezi);
    return () => {
      aktivno = false;
      void sb.removeChannel(kanal);
      document.removeEventListener("visibilitychange", naVidljivost);
      window.removeEventListener(DOGADAJ_PROCITANO, osvjezi);
    };
  }, [uloga]);

  return broj;
}
