"use client";

import { useCallback, useEffect, useState } from "react";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { uVjezbu, type Vjezba } from "@/lib/treninzi";

/** Cijela biblioteka vježbi, abecedno. */
export function useVjezbe() {
  const [stanje, setStanje] = useState<{ vjezbe: Vjezba[]; greska: string | null } | null>(null);
  const [verzija, setVerzija] = useState(0);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("vjezbe")
      .select("*")
      .order("naziv")
      .then(({ data, error }) => {
        if (!aktivno) return;
        setStanje({
          vjezbe: (data ?? []).map(uVjezbu),
          greska: error ? prevediGresku(error.message) : null,
        });
      });
    return () => {
      aktivno = false;
    };
  }, [verzija]);

  const osvjezi = useCallback(() => setVerzija((v) => v + 1), []);
  return { vjezbe: stanje?.vjezbe ?? null, greska: stanje?.greska ?? null, osvjezi };
}

/** Filtriranje po tekstu i mišićnoj skupini (bez obzira na kvačice i velika slova). */
export function filtrirajVjezbe(vjezbe: Vjezba[], upit: string, skupina: string | null) {
  const normaliziraj = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d");
  const u = normaliziraj(upit.trim());
  return vjezbe.filter(
    (v) =>
      (!skupina || v.misicna_skupina === skupina) &&
      (!u || normaliziraj(`${v.naziv} ${v.misicna_skupina}`).includes(u)),
  );
}
