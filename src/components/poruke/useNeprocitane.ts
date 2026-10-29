"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { osvjeziPretplatuJednom } from "@/lib/obavijesti";
import { brojNeprocitanih, DOGADAJ_PROCITANO } from "@/lib/poruke";
import { supabase } from "@/lib/supabase/client";
import type { Uloga } from "@/lib/tipovi";

/** Broj nepročitanih poruka za izbornik – osvježava se čim stigne ili se pročita poruka. */
export function useNeprocitane(uloga: Uloga) {
  const [broj, setBroj] = useState(0);
  const { profil } = useAuth();
  const korisnikId = profil?.id ?? null;

  useEffect(() => {
    let aktivno = true;
    let odgoda: ReturnType<typeof setTimeout> | undefined;
    const osvjezi = () =>
      brojNeprocitanih(uloga).then((n) => {
        if (aktivno) setBroj(n);
      });
    // više promjena odjednom (npr. poruka svima) → jedno brojanje
    const osvjeziUskoro = () => {
      clearTimeout(odgoda);
      odgoda = setTimeout(() => void osvjezi(), 500);
    };
    void osvjezi();
    // ako su obavijesti dopuštene, ovaj uređaj ostaje prijavljen za njih
    osvjeziPretplatuJednom();

    const sb = supabase();
    const kanal = sb
      .channel(`neprocitane-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        // klijent sluša samo svoj razgovor; trener sve
        uloga === "klijent" && korisnikId
          ? { event: "*", schema: "public", table: "poruke", filter: `klijent_id=eq.${korisnikId}` }
          : { event: "*", schema: "public", table: "poruke" },
        osvjeziUskoro,
      )
      .subscribe();
    const naVidljivost = () => {
      if (document.visibilityState === "visible") void osvjezi();
    };
    document.addEventListener("visibilitychange", naVidljivost);
    window.addEventListener(DOGADAJ_PROCITANO, osvjeziUskoro);
    return () => {
      aktivno = false;
      clearTimeout(odgoda);
      void sb.removeChannel(kanal);
      document.removeEventListener("visibilitychange", naVidljivost);
      window.removeEventListener(DOGADAJ_PROCITANO, osvjeziUskoro);
    };
  }, [uloga, korisnikId]);

  return broj;
}
