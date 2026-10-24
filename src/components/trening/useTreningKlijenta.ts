"use client";

import { useCallback, useEffect, useState } from "react";
import { danasZagreb, dodajDane, ponedjeljak } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import {
  SELECT_PLANA,
  uPlan,
  uTrening,
  uVjezbu,
  type Plan,
  type Trening,
  type Vjezba,
} from "@/lib/treninzi";

/** plan_vjezba_id -> vježba kojom ju je klijent zamijenio */
export type Zamjene = Record<string, Vjezba>;

type Stanje = {
  klijentId: string;
  plan: Plan | null;
  treninzi: Trening[];
  zamjene: Zamjene;
  greska: string | null;
};

async function dohvati(klijentId: string): Promise<Stanje> {
  const sb = supabase();
  const danas = danasZagreb();
  const pon = ponedjeljak(danas);
  const ned = dodajDane(pon, 6);

  const [d, t, z] = await Promise.all([
    sb
      .from("dodjele_planova")
      .select("plan_id")
      .eq("klijent_id", klijentId)
      .lte("od_datuma", danas)
      .or(`do_datuma.is.null,do_datuma.gt.${danas}`)
      .order("od_datuma", { ascending: false })
      .limit(1),
    sb
      .from("treninzi")
      .select("*, serije:odradjene_serije(*)")
      .eq("klijent_id", klijentId)
      .gte("datum", pon)
      .lte("datum", ned),
    sb.from("zamjene_vjezbi").select("plan_vjezba_id, vjezba:vjezbe(*)").eq("klijent_id", klijentId),
  ]);

  const greska = d.error || t.error || z.error;
  if (greska) {
    return { klijentId, plan: null, treninzi: [], zamjene: {}, greska: prevediGresku(greska.message) };
  }

  const zamjene: Zamjene = {};
  for (const red of z.data ?? []) {
    const v = Array.isArray(red.vjezba) ? red.vjezba[0] : red.vjezba;
    if (v) zamjene[String(red.plan_vjezba_id)] = uVjezbu(v as Record<string, unknown>);
  }

  const treninzi = (t.data ?? []).map(uTrening);
  const planId = d.data?.[0]?.plan_id;
  if (!planId) return { klijentId, plan: null, treninzi, zamjene, greska: null };

  const p = await sb.from("planovi").select(SELECT_PLANA).eq("id", planId).maybeSingle();
  return {
    klijentId,
    plan: p.data ? uPlan(p.data) : null,
    treninzi,
    zamjene,
    greska: p.error ? prevediGresku(p.error.message) : null,
  };
}

/** Aktivni plan klijenta, njegove zamjene vježbi i treninzi ovaj tjedan. */
export function useTreningKlijenta(klijentId: string) {
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [verzija, setVerzija] = useState(0);

  useEffect(() => {
    let aktivno = true;
    dohvati(klijentId).then((r) => {
      if (aktivno) setStanje(r);
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, verzija]);

  const osvjezi = useCallback(() => setVerzija((v) => v + 1), []);
  const spremno = stanje?.klijentId === klijentId;
  return {
    ucitano: spremno,
    plan: spremno ? stanje.plan : null,
    treninzi: spremno ? stanje.treninzi : [],
    zamjene: spremno ? stanje.zamjene : {},
    greska: spremno ? stanje.greska : null,
    osvjezi,
  };
}
