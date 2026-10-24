"use client";

import { useCallback, useEffect, useState } from "react";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { uVjezbu, type Vjezba } from "@/lib/treninzi";

/**
 * Vježbe, abecedno.
 * - "biblioteka": samo zajednička biblioteka trenera
 * - "moje": samo vlastite vježbe zadanog klijenta
 * - "sve": sve što prijavljeni korisnik smije vidjeti (biblioteka + svoje)
 */
export type OpsegVjezbi = { vrsta: "biblioteka" } | { vrsta: "moje"; klijentId: string } | { vrsta: "sve" };

export function useVjezbe(opseg: OpsegVjezbi = { vrsta: "biblioteka" }) {
  const [stanje, setStanje] = useState<{ kljuc: string; vjezbe: Vjezba[]; greska: string | null } | null>(
    null,
  );
  const [verzija, setVerzija] = useState(0);
  const vrsta = opseg.vrsta;
  const klijentId = opseg.vrsta === "moje" ? opseg.klijentId : "";
  const kljuc = `${vrsta}|${klijentId}`;

  useEffect(() => {
    let aktivno = true;
    let upit = supabase().from("vjezbe").select("*").order("naziv");
    if (vrsta === "biblioteka") upit = upit.is("vlasnik_id", null);
    if (vrsta === "moje") upit = upit.eq("vlasnik_id", klijentId);
    upit.then(({ data, error }) => {
      if (!aktivno) return;
      setStanje({
        kljuc,
        vjezbe: (data ?? []).map(uVjezbu),
        greska: error ? prevediGresku(error.message) : null,
      });
    });
    return () => {
      aktivno = false;
    };
  }, [vrsta, klijentId, kljuc, verzija]);

  const osvjezi = useCallback(() => setVerzija((v) => v + 1), []);
  const spremno = stanje?.kljuc === kljuc;
  return {
    vjezbe: spremno ? stanje.vjezbe : null,
    greska: spremno ? stanje.greska : null,
    osvjezi,
  };
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
