"use client";

import { useCallback, useEffect, useState } from "react";
import { prevediGresku } from "@/lib/greske";
import { uCilj, uObrok, type Cilj, type Obrok } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";

type Stanje = {
  kljuc: string;
  obroci: Obrok[];
  ciljevi: Cilj[];
  greska: string | null;
};

/**
 * Obroci klijenta u razdoblju [od, doDana] i svi njegovi ciljevi do tog dana
 * (od najnovijeg prema starijem).
 */
export function usePrehrana(klijentId: string, od: string, doDana: string) {
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [verzija, setVerzija] = useState(0);
  const kljuc = `${klijentId}|${od}|${doDana}`;

  useEffect(() => {
    let aktivno = true;
    const sb = supabase();
    Promise.all([
      sb
        .from("obroci")
        .select("*")
        .eq("klijent_id", klijentId)
        .gte("datum", od)
        .lte("datum", doDana)
        .order("kreirano", { ascending: true }),
      sb
        .from("ciljevi_makroa")
        .select("*")
        .eq("klijent_id", klijentId)
        .lte("vrijedi_od", doDana)
        .order("vrijedi_od", { ascending: false }),
    ]).then(([o, c]) => {
      if (!aktivno) return;
      const greska = o.error || c.error;
      setStanje({
        kljuc,
        obroci: (o.data ?? []).map(uObrok),
        ciljevi: (c.data ?? []).map(uCilj),
        greska: greska ? prevediGresku(greska.message) : null,
      });
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, od, doDana, kljuc, verzija]);

  const osvjezi = useCallback(() => setVerzija((v) => v + 1), []);
  const spremno = stanje?.kljuc === kljuc;

  return {
    obroci: spremno ? stanje.obroci : null,
    ciljevi: spremno ? stanje.ciljevi : null,
    greska: spremno ? stanje.greska : null,
    osvjezi,
  };
}
