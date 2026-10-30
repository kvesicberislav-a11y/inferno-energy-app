"use client";

import { useCallback, useEffect, useState } from "react";
import { danMjesec } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { formatG } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { uKilazu, type Kilaza } from "@/lib/treninzi";

type Stanje = {
  klijentId: string;
  bazne: Set<string>;
  kilaze: Map<string, Kilaza>;
  greska: string | null;
};

/** Bazne vježbe klijenta i njegove najveće/zadnje kilaže (za slaganje programa). */
export function useBazneIKilaze(klijentId: string | null) {
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [verzija, setVerzija] = useState(0);

  useEffect(() => {
    if (!klijentId) return;
    let aktivno = true;
    const sb = supabase();
    Promise.all([
      sb.from("bazne_vjezbe").select("vjezba_id").eq("klijent_id", klijentId),
      sb.rpc("kilaze_klijenta", { p_klijent: klijentId }),
    ]).then(([b, k]) => {
      if (!aktivno) return;
      const greska = b.error || k.error;
      setStanje({
        klijentId,
        bazne: new Set((b.data ?? []).map((r) => String(r.vjezba_id))),
        kilaze: new Map(((k.data as Record<string, unknown>[] | null) ?? []).map((r) => [String(r.vjezba_id), uKilazu(r)])),
        greska: greska ? prevediGresku(greska.message) : null,
      });
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, verzija]);

  const osvjezi = useCallback(() => setVerzija((v) => v + 1), []);
  const spremno = klijentId !== null && stanje?.klijentId === klijentId;
  return {
    ucitano: spremno,
    bazne: spremno ? stanje.bazne : new Set<string>(),
    kilaze: spremno ? stanje.kilaze : new Map<string, Kilaza>(),
    greska: spremno ? stanje.greska : null,
    osvjezi,
  };
}

/** "max 80 kg × 6 · 4 serije" (ili null ako klijent još nije radio tu vježbu s kilažom) */
export function kratkoMax(k: Kilaza | null | undefined) {
  if (!k || k.maxKg === null) return null;
  const serije = k.maxSerija ? ` · ${k.maxSerija} ${k.maxSerija === 1 ? "serija" : k.maxSerija < 5 ? "serije" : "serija"}` : "";
  return `max ${formatG(k.maxKg)} kg × ${k.maxPonavljanja ?? "?"}${serije}`;
}

/** "Najviše 80 kg × 5 (12. 10.) · zadnje 75 kg × 8 (20. 10.)" */
export function opisKilaze(k: Kilaza | null | undefined) {
  if (!k) return "Klijent još nije radio ovu vježbu.";
  const dijelovi: string[] = [];
  if (k.maxKg !== null) {
    dijelovi.push(
      `Najviše ${formatG(k.maxKg)} kg × ${k.maxPonavljanja ?? "?"}${k.maxSerija ? `, ${k.maxSerija} ser.` : ""}${
        k.maxDatum ? ` (${danMjesec(k.maxDatum)})` : ""
      }`,
    );
  }
  if (k.zadnjaKg !== null && k.zadnjiDatum && k.zadnjiDatum !== k.maxDatum) {
    dijelovi.push(`zadnje ${formatG(k.zadnjaKg)} kg × ${k.zadnjaPonavljanja ?? "?"} (${danMjesec(k.zadnjiDatum)})`);
  }
  return dijelovi.length ? dijelovi.join(" · ") : "Radio je bez dodatne kilaže.";
}
