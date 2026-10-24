"use client";

import { useCallback, useEffect, useState } from "react";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { uMjerenje, uOsobnePodatke, type Mjerenje, type OsobniPodaci } from "@/lib/tijelo";

type Stanje = {
  klijentId: string;
  osobni: OsobniPodaci;
  kreirano: string;
  mjerenja: Mjerenje[];
  greska: string | null;
};

/** Osobni podaci klijenta i sva njegova mjerenja (od najstarijeg). */
export function useTijelo(klijentId: string) {
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [verzija, setVerzija] = useState(0);

  useEffect(() => {
    let aktivno = true;
    const sb = supabase();
    Promise.all([
      sb.from("profili").select("visina_cm, spol, godina_rodenja, kreirano").eq("id", klijentId).maybeSingle(),
      sb.from("mjerenja").select("*").eq("klijent_id", klijentId).order("datum", { ascending: true }),
    ]).then(([p, m]) => {
      if (!aktivno) return;
      const greska = p.error || m.error;
      setStanje({
        klijentId,
        osobni: uOsobnePodatke(p.data),
        kreirano: String(p.data?.kreirano ?? new Date().toISOString()),
        mjerenja: (m.data ?? []).map(uMjerenje),
        greska: greska ? prevediGresku(greska.message) : null,
      });
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, verzija]);

  const osvjezi = useCallback(() => setVerzija((v) => v + 1), []);
  const spremno = stanje?.klijentId === klijentId;
  return { stanje: spremno ? stanje : null, osvjezi };
}
