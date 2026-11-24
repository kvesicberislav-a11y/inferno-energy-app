"use client";

import { useCallback, useEffect, useState } from "react";
import { danMjesec } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { formatKg } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { kratkoPolazno, uKilazu, uPodatkeBazne, type Kilaza, type PodaciBazne } from "@/lib/treninzi";

type Stanje = {
  klijentId: string;
  bazne: Set<string>;
  /** polazna kilaža × ponavljanja i stalna napomena po baznoj vježbi */
  podaci: Map<string, PodaciBazne>;
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
      sb.from("bazne_vjezbe").select("vjezba_id, napomena, serije_plan").eq("klijent_id", klijentId),
      sb.rpc("kilaze_klijenta", { p_klijent: klijentId }),
    ]).then(([b, k]) => {
      if (!aktivno) return;
      const greska = b.error || k.error;
      const redovi = (b.data ?? []) as Record<string, unknown>[];
      setStanje({
        klijentId,
        bazne: new Set(redovi.map((r) => String(r.vjezba_id))),
        podaci: new Map(redovi.map((r) => [String(r.vjezba_id), uPodatkeBazne(r)])),
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
    podaci: spremno ? stanje.podaci : new Map<string, PodaciBazne>(),
    kilaze: spremno ? stanje.kilaze : new Map<string, Kilaza>(),
    greska: spremno ? stanje.greska : null,
    osvjezi,
  };
}

/** Stalne napomene klijenta po vježbi (npr. "sjedalo lvl3") – za klijentov prikaz treninga. */
export function useStalneNapomene(klijentId: string | null) {
  const [stanje, setStanje] = useState<{ klijentId: string; napomene: Map<string, string> } | null>(null);

  useEffect(() => {
    if (!klijentId) return;
    let aktivno = true;
    supabase()
      .from("bazne_vjezbe")
      .select("vjezba_id, napomena")
      .eq("klijent_id", klijentId)
      .neq("napomena", "")
      .then(({ data }) => {
        if (!aktivno) return;
        setStanje({
          klijentId,
          napomene: new Map((data ?? []).map((r) => [String(r.vjezba_id), String(r.napomena ?? "")])),
        });
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId]);

  return stanje?.klijentId === klijentId ? stanje.napomene : new Map<string, string>();
}

const s = (sekunde: boolean | undefined) => (sekunde ? " s" : "");

/** "max 80 kg × 6 · 4 serije" (ili null ako klijent još nije radio tu vježbu s kilažom) */
export function kratkoMax(k: Kilaza | null | undefined) {
  if (!k || k.maxKg === null) return null;
  const serije = k.maxSerija ? ` · ${k.maxSerija} ${k.maxSerija === 1 ? "serija" : k.maxSerija < 5 ? "serije" : "serija"}` : "";
  return `max ${formatKg(k.maxKg)} kg × ${k.maxPonavljanja ?? "?"}${s(k.maxSekunde)}${serije}`;
}

type NajtezaBazna = { kg: number; ponavljanja: string; sekunde: boolean };

/** Najteža serija u baznim serijama (ili null ako nema kilaže). */
function maxBaznih(b: PodaciBazne | null | undefined): NajtezaBazna | null {
  let naj: NajtezaBazna | null = null;
  for (const x of b?.serije_plan ?? []) {
    if (x.kg !== null && x.kg > 0 && (!naj || x.kg > naj.kg)) naj = { kg: x.kg, ponavljanja: x.ponavljanja, sekunde: Boolean(x.sekunde) };
  }
  return naj;
}

/** Je li najveća kilaža iz baznih serija veća od one s treninga (tada se prikazuje ona)? */
function baznaJeVeca(k: Kilaza | null | undefined, b: PodaciBazne | null | undefined) {
  const bm = maxBaznih(b);
  return bm !== null && (k?.maxKg == null || bm.kg > k.maxKg) ? bm : null;
}

/** Najveća kilaža koju je klijent digao na vježbi: s treninga ili iz upisanih baznih serija. */
export function najvecaKg(k: Kilaza | null | undefined, b: PodaciBazne | null | undefined): number | null {
  return baznaJeVeca(k, b)?.kg ?? k?.maxKg ?? null;
}

/** "max 80 kg × 6" – najveće s treninga ili iz baznih serija (što je veće). */
export function kratkoNajvise(k: Kilaza | null | undefined, b: PodaciBazne | null | undefined) {
  const bm = baznaJeVeca(k, b);
  return bm ? `max ${formatKg(bm.kg)} kg × ${bm.ponavljanja}${s(bm.sekunde)}` : kratkoMax(k);
}

/** Najveća kilaža, a ako je nema – bazne serije. */
export function kratkoMaxIliPolazno(k: Kilaza | null | undefined, b: PodaciBazne | null | undefined) {
  return kratkoNajvise(k, b) ?? kratkoPolazno(b);
}

/** "Najviše 80 kg × 5 (12. 10.) · zadnje 75 kg × 8 (20. 10.) · bazno …" */
export function opisKilaze(k: Kilaza | null | undefined, polazno?: PodaciBazne | null) {
  const p = kratkoPolazno(polazno);
  const bm = baznaJeVeca(k, polazno);
  if (!k) {
    if (!p) return "Klijent još nije radio ovu vježbu.";
    return bm ? `Najviše ${formatKg(bm.kg)} kg × ${bm.ponavljanja}${s(bm.sekunde)} · ${p}` : p;
  }
  const dijelovi: string[] = [];
  if (bm) {
    dijelovi.push(`Najviše ${formatKg(bm.kg)} kg × ${bm.ponavljanja}${s(bm.sekunde)}`);
  } else if (k.maxKg !== null) {
    dijelovi.push(
      `Najviše ${formatKg(k.maxKg)} kg × ${k.maxPonavljanja ?? "?"}${s(k.maxSekunde)}${k.maxSerija ? `, ${k.maxSerija} ser.` : ""}${
        k.maxDatum ? ` (${danMjesec(k.maxDatum)})` : ""
      }`,
    );
  }
  if (k.zadnjaKg !== null && k.zadnjiDatum && k.zadnjiDatum !== k.maxDatum) {
    dijelovi.push(
      k.zadnjaRijec
        ? `zadnje ${k.zadnjaPonavljanja ?? "?"}${s(k.zadnjaSekunde)} × ${k.zadnjaRijec} (${danMjesec(k.zadnjiDatum)})`
        : `zadnje ${formatKg(k.zadnjaKg)} kg × ${k.zadnjaPonavljanja ?? "?"}${s(k.zadnjaSekunde)} (${danMjesec(k.zadnjiDatum)})`,
    );
  }
  if (p) dijelovi.push(p);
  return dijelovi.length ? dijelovi.join(" · ") : "Radio je bez dodatne kilaže.";
}
