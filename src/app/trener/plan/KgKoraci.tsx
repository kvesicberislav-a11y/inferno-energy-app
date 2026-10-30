"use client";

import { useEffect, useRef, type RefObject } from "react";
import { prevediGresku } from "@/lib/greske";
import { formatG } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { KORAK_KG } from "@/lib/treninzi";

type Povratni = { planVjezbaId: string; onGreska: (g: string) => void };

/** Spremi kilažu koja čeka (ako je ima). */
async function spremiKg(ceka: RefObject<number | null | undefined>, p: Povratni) {
  if (ceka.current === undefined) return;
  const nova = ceka.current;
  ceka.current = undefined;
  const { error } = await supabase().from("plan_vjezbe").update({ kg: nova }).eq("id", p.planVjezbaId);
  if (error) p.onGreska(prevediGresku(error.message));
}

/**
 * Brza promjena kilaže izravno u programu: − / + po 2,5 kg.
 * Prikaz odmah prati dodir (stanje drži roditelj), a sprema se malo nakon zadnjeg dodira,
 * jedno spremanje za drugim (zadnje uvijek pobjeđuje).
 */
export function KgKoraci({
  planVjezbaId,
  kg,
  maxKg,
  onPromjena,
  onGreska,
}: {
  planVjezbaId: string;
  kg: number | null;
  /** najveća kilaža klijenta – prvi „+” na praznoj kilaži kreće od nje */
  maxKg: number | null;
  onPromjena: (kg: number | null) => void;
  onGreska: (g: string) => void;
}) {
  const ceka = useRef<number | null | undefined>(undefined);
  const sat = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lanac = useRef<Promise<void>>(Promise.resolve());
  const povratni = useRef<Povratni>({ planVjezbaId, onGreska });
  useEffect(() => {
    povratni.current = { planVjezbaId, onGreska };
  });

  // spremi i ako se ekran zatvori prije isteka čekanja
  useEffect(
    () => () => {
      clearTimeout(sat.current);
      const p = povratni.current;
      lanac.current = lanac.current.then(() => spremiKg(ceka, p));
    },
    [],
  );

  function promijeni(smjer: -1 | 1) {
    let nova: number | null;
    if (kg === null) nova = smjer > 0 ? (maxKg ?? KORAK_KG) : null;
    else {
      nova = Math.round((kg + smjer * KORAK_KG) * 10) / 10;
      if (nova <= 0) nova = null;
    }
    nova = nova !== null ? Math.min(1000, nova) : null;
    onPromjena(nova);
    ceka.current = nova;
    clearTimeout(sat.current);
    sat.current = setTimeout(() => {
      const p = povratni.current;
      lanac.current = lanac.current.then(() => spremiKg(ceka, p));
    }, 700);
  }

  const gumb =
    "flex h-10 w-9 items-center justify-center rounded-xl bg-povrsina text-xl font-bold text-tekst active:scale-95 disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" aria-label="Manje kilograma" className={gumb} disabled={kg === null} onClick={() => promijeni(-1)}>
        −
      </button>
      <span className="w-12 text-center leading-none tabular-nums">
        <span className="block text-base font-bold">{kg !== null ? formatG(kg) : "—"}</span>
        <span className="text-[10px] text-tekst-2">kg</span>
      </span>
      <button type="button" aria-label="Više kilograma" className={gumb} onClick={() => promijeni(1)}>
        +
      </button>
    </div>
  );
}
