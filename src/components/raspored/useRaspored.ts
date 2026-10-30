"use client";

import { useCallback, useEffect, useState } from "react";
import { prevediGresku } from "@/lib/greske";
import { danasZagreb, dodajDane } from "@/lib/datum";
import {
  aktivnaPravila,
  razvijTermine,
  uDodatni,
  uIznimku,
  uPravilo,
  type Dodatni,
  type Iznimka,
  type Pravilo,
  type Termin,
} from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";

export type Raspored = {
  kljuc: string;
  pravila: Pravilo[];
  iznimke: Iznimka[];
  dodatni: Dodatni[];
  termini: Termin[];
  imena: Record<string, string>;
  /** redni broj boje klijenta u kalendaru (profili.boja) */
  boje: Record<string, number | null>;
  greska: string | null;
};

type Red = Record<string, unknown>;

function bojaIzReda(r: Red): number | null {
  const k = (Array.isArray(r.klijent) ? r.klijent[0] : r.klijent) as { boja?: number | null } | null;
  return k?.boja ?? null;
}

function imeKlijenta(r: Red) {
  const k = (Array.isArray(r.klijent) ? r.klijent[0] : r.klijent) as { ime?: string; email?: string } | null;
  return k?.ime || k?.email || "Klijent";
}

/** Termini u razdoblju [od, doDana] – za jednog klijenta ili (trener) za sve. */
export function useRaspored(klijentId: string | null, od: string, doDana: string) {
  const [stanje, setStanje] = useState<Raspored | null>(null);
  const [verzija, setVerzija] = useState(0);
  const kljuc = `${klijentId ?? "svi"}|${od}|${doDana}`;

  useEffect(() => {
    let aktivno = true;
    const sb = supabase();
    let pq = sb.from("termini_pravila").select("*, klijent:profili(ime, email, boja), iznimke:termini_iznimke(*)");
    let dq = sb
      .from("termini_dodatni")
      .select("*, klijent:profili(ime, email, boja)")
      .gte("datum", od)
      .lte("datum", doDana);
    if (klijentId) {
      pq = pq.eq("klijent_id", klijentId);
      dq = dq.eq("klijent_id", klijentId);
    }
    Promise.all([pq, dq]).then(([p, d]) => {
      if (!aktivno) return;
      const imena: Record<string, string> = {};
      const boje: Record<string, number | null> = {};
      const pravila = (p.data ?? []).map((r: Red) => {
        imena[String(r.klijent_id)] = imeKlijenta(r);
        boje[String(r.klijent_id)] = bojaIzReda(r);
        return uPravilo(r);
      });
      const iznimke = (p.data ?? []).flatMap((r: Red) => ((r.iznimke as Red[] | null) ?? []).map(uIznimku));
      const dodatni = (d.data ?? []).map((r: Red) => {
        imena[String(r.klijent_id)] = imeKlijenta(r);
        boje[String(r.klijent_id)] = bojaIzReda(r);
        return uDodatni(r);
      });
      const greska = p.error || d.error;
      setStanje({
        kljuc,
        // za prikaz "stalni termini" samo oni koji traju; ukinuti ostaju u prošlim tjednima
        pravila: aktivnaPravila(pravila, danasZagreb()),
        iznimke,
        dodatni,
        termini: razvijTermine(pravila, iznimke, dodatni, od, doDana),
        imena,
        boje,
        greska: greska ? prevediGresku(greska.message) : null,
      });
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, od, doDana, kljuc, verzija]);

  const osvjezi = useCallback(() => setVerzija((v) => v + 1), []);
  return { raspored: stanje?.kljuc === kljuc ? stanje : null, osvjezi };
}

/**
 * Ukini stalni termin: završava jučer, pa prošli termini ostaju u rasporedu.
 * Ako još nije ni počeo, briše se.
 */
export async function ukiniPravilo(p: Pravilo): Promise<string | null> {
  const jucer = dodajDane(danasZagreb(), -1);
  const sb = supabase().from("termini_pravila");
  const { error } =
    p.od_datuma > jucer ? await sb.delete().eq("id", p.id) : await sb.update({ do_datuma: jucer }).eq("id", p.id);
  return error ? prevediGresku(error.message) : null;
}

/**
 * Nakon brisanja/ukidanja termina: obriši prazne planove treninga (bez upisanih serija)
 * od zadanog dana nadalje koji više nemaju nijedan termin tog klijenta.
 * Planovi otkazanih termina ostaju (termin se može vratiti).
 */
export async function ocistiPlanoveBezTermina(klijentId: string, od: string): Promise<void> {
  const sb = supabase();
  const { data: planovi } = await sb
    .from("treninzi")
    .select("datum")
    .eq("klijent_id", klijentId)
    .eq("iz_kalendara", true)
    .gte("datum", od);
  const datumi = (planovi ?? []).map((r) => String(r.datum));
  if (datumi.length === 0) return;
  const doDana = datumi.reduce((m, d) => (d > m ? d : m), od);
  const [p, d] = await Promise.all([
    sb.from("termini_pravila").select("*, iznimke:termini_iznimke(*)").eq("klijent_id", klijentId),
    sb.from("termini_dodatni").select("*").eq("klijent_id", klijentId).gte("datum", od).lte("datum", doDana),
  ]);
  if (p.error || d.error) return;
  const pravila = (p.data ?? []).map((r: Red) => uPravilo(r));
  const iznimke = (p.data ?? []).flatMap((r: Red) => ((r.iznimke as Red[] | null) ?? []).map(uIznimku));
  const dodatni = (d.data ?? []).map((r: Red) => uDodatni(r));
  const sTerminom = new Set(razvijTermine(pravila, iznimke, dodatni, od, doDana).map((t) => t.datum));
  await Promise.all(
    datumi
      .filter((x) => !sTerminom.has(x))
      .map((x) => sb.rpc("ukloni_trening_termina", { p_klijent: klijentId, p_datum: x })),
  );
}

/** Javi poslužitelju da pošalje klijentu e-mail o promjeni rasporeda. */
export async function obavijestiKlijenta(klijentId: string, promjena: string): Promise<string> {
  try {
    const { data } = await supabase().auth.getSession();
    const odgovor = await fetch("/api/raspored-obavijest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ klijentId, promjena }),
    });
    const r = (await odgovor.json().catch(() => ({}))) as { poslano?: boolean; razlog?: string; greska?: string };
    if (r.poslano) return "Spremljeno. Klijent je obaviješten e-mailom.";
    if (r.razlog === "nije_podeseno") return "Spremljeno. (E-mail obavijesti uključit će se kad se podesi domena.)";
    return `Spremljeno, ali e-mail nije poslan${r.greska ? `: ${r.greska}` : "."}`;
  } catch {
    return "Spremljeno, ali e-mail nije poslan (nema veze).";
  }
}
