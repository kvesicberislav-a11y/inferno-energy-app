"use client";

import { useEffect, useState } from "react";
import { prevediGresku } from "@/lib/greske";
import { uCilj, type Cilj } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { uDodjeluZaPridrzavanje } from "@/lib/treninzi";

export type DanMakroa = { datum: string; kcal: number; proteini: number; ugljikohidrati: number; masti: number };
export type TjedanVolumena = { tjedan: string; volumen: number; serija: number; treninga: number };
/** planiran = trening iz kalendara koji je trener složio (klijenti uživo) */
export type DanTreninga = { datum: string; odraden: boolean; planiran: boolean };
export type Dodjela = ReturnType<typeof uDodjeluZaPridrzavanje>;

export type Statistika = {
  kljuc: string;
  makroi: DanMakroa[];
  ciljevi: Cilj[];
  volumen: TjedanVolumena[];
  treninzi: DanTreninga[];
  dodjele: Dodjela[];
  greska: string | null;
};

async function dohvati(klijentId: string, od: string, doDana: string, kljuc: string): Promise<Statistika> {
  const sb = supabase();
  const [m, c, v, t, d] = await Promise.all([
    sb.rpc("dnevni_makroi", { p_klijent: klijentId, p_od: od, p_do: doDana }),
    sb
      .from("ciljevi_makroa")
      .select("*")
      .eq("klijent_id", klijentId)
      .lte("vrijedi_od", doDana)
      .order("vrijedi_od", { ascending: false }),
    sb.rpc("tjedni_volumen", { p_klijent: klijentId, p_od: od, p_do: doDana }),
    sb
      .from("treninzi")
      .select("datum, zavrsen, iz_kalendara, odradjene_serije(count), trening_vjezbe(count)")
      .eq("klijent_id", klijentId)
      .gte("datum", od)
      .lte("datum", doDana),
    sb
      .from("dodjele_planova")
      .select("od_datuma, do_datuma, plan:planovi(ciklus_tjedana, pocetak, plan_dani(tjedan, dan_u_tjednu))")
      .eq("klijent_id", klijentId)
      .lte("od_datuma", doDana),
  ]);
  const greska = m.error || c.error || v.error || t.error || d.error;
  type RedM = { datum: string; kcal: number; proteini: number; ugljikohidrati: number; masti: number };
  type RedV = { tjedan: string; volumen: number; serija: number; treninga: number };
  return {
    kljuc,
    makroi: ((m.data as RedM[] | null) ?? []).map((r) => ({
      datum: String(r.datum),
      kcal: Number(r.kcal),
      proteini: Number(r.proteini),
      ugljikohidrati: Number(r.ugljikohidrati),
      masti: Number(r.masti),
    })),
    ciljevi: (c.data ?? []).map(uCilj),
    volumen: ((v.data as RedV[] | null) ?? []).map((r) => ({
      tjedan: String(r.tjedan),
      volumen: Number(r.volumen),
      serija: Number(r.serija),
      treninga: Number(r.treninga),
    })),
    treninzi: (t.data ?? []).map((r) => ({
      datum: String(r.datum),
      odraden:
        Boolean(r.zavrsen) || Number((r.odradjene_serije as { count: number }[] | null)?.[0]?.count ?? 0) > 0,
      planiran:
        Boolean(r.iz_kalendara) && Number((r.trening_vjezbe as { count: number }[] | null)?.[0]?.count ?? 0) > 0,
    })),
    dodjele: (d.data ?? []).map(uDodjeluZaPridrzavanje),
    greska: greska ? prevediGresku(greska.message) : null,
  };
}

/** Zbrojevi za grafove i pridržavanje u razdoblju [od, doDana]. */
export function useStatistika(klijentId: string, od: string, doDana: string) {
  const [stanje, setStanje] = useState<Statistika | null>(null);
  const kljuc = `${klijentId}|${od}|${doDana}`;

  useEffect(() => {
    let aktivno = true;
    dohvati(klijentId, od, doDana, kljuc).then((r) => {
      if (aktivno) setStanje(r);
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, od, doDana, kljuc]);

  // Dok se učitava novo razdoblje, prethodni podaci ostaju (bez skakanja).
  return { statistika: stanje, osvjezava: stanje !== null && stanje.kljuc !== kljuc };
}
