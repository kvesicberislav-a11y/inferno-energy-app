"use client";

import { useEffect, useState } from "react";
import { Kartica, Poruka } from "@/components/ui";
import { danasZagreb, opisDana } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { formatG } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";

type SerijaS = { redni: number; ponavljanja: number; kg: number; vjezba: string; vjezbaId: string };
type TreningS = { id: string; datum: string; naziv: string; zavrsen: boolean; serije: SerijaS[] };
type Podaci = { klijentId: string; treninzi: TreningS[]; greska: string | null };

const KORAK = 10;

async function dohvati(klijentId: string, broj: number): Promise<Podaci> {
  const { data, error } = await supabase()
    .from("treninzi")
    .select("id, datum, naziv, zavrsen, iz_kalendara, odradjene_serije(redni_broj, ponavljanja, kg, vjezba_id, vjezba:vjezbe(naziv))")
    .eq("klijent_id", klijentId)
    // samo odrađeni: ne budući ni samo isplanirani treninzi iz kalendara
    .lte("datum", danasZagreb())
    .order("datum", { ascending: false })
    .limit(broj);
  if (error) return { klijentId, treninzi: [], greska: prevediGresku(error.message) };
  return {
    klijentId,
    greska: null,
    treninzi: (data ?? [])
      .filter((t) => !t.iz_kalendara || t.zavrsen || ((t.odradjene_serije as unknown[] | null) ?? []).length > 0)
      .map((t) => ({
      id: String(t.id),
      datum: String(t.datum),
      naziv: String(t.naziv ?? ""),
      zavrsen: Boolean(t.zavrsen),
      serije: ((t.odradjene_serije as Record<string, unknown>[] | null) ?? []).map((s) => {
        const v = Array.isArray(s.vjezba) ? s.vjezba[0] : s.vjezba;
        return {
          redni: Number(s.redni_broj),
          ponavljanja: Number(s.ponavljanja),
          kg: Number(s.kg),
          vjezbaId: String(s.vjezba_id),
          vjezba: String((v as { naziv?: string } | null)?.naziv ?? "Vježba"),
        };
      }),
    })),
  };
}

/** Povijest treninga klijenta s odrađenim serijama po vježbi. */
export function PovijestTreninga({ klijentId }: { klijentId: string }) {
  const [broj, setBroj] = useState(KORAK);
  const [podaci, setPodaci] = useState<Podaci | null>(null);
  const [otvoren, setOtvoren] = useState<string | null>(null);

  useEffect(() => {
    let aktivno = true;
    dohvati(klijentId, broj).then((r) => {
      if (aktivno) setPodaci(r);
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, broj]);

  const treninzi = podaci?.klijentId === klijentId ? podaci.treninzi : null;

  return (
    <Kartica className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">Odrađeni treninzi</h3>
      {podaci?.greska && <Poruka tip="greska">{podaci.greska}</Poruka>}
      {treninzi === null ? (
        <p className="text-sm text-tekst-2">Učitavam…</p>
      ) : treninzi.length === 0 ? (
        <p className="text-sm text-tekst-2">Klijent još nije upisao nijedan trening.</p>
      ) : (
        <>
          {treninzi.map((t) => {
            const volumen = t.serije.reduce((s, x) => s + x.kg * x.ponavljanja, 0);
            const poVjezbi = new Map<string, SerijaS[]>();
            for (const s of [...t.serije].sort((a, b) => a.redni - b.redni)) {
              poVjezbi.set(s.vjezbaId, [...(poVjezbi.get(s.vjezbaId) ?? []), s]);
            }
            const jeOtvoren = otvoren === t.id;
            return (
              <div key={t.id} className="rounded-2xl border border-rub bg-povrsina-2">
                <button
                  type="button"
                  onClick={() => setOtvoren(jeOtvoren ? null : t.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {t.naziv || "Trening"}{" "}
                      <span className={t.zavrsen ? "text-emerald-300" : "text-tekst-2"}>
                        {t.zavrsen ? "✓" : "· nije završen"}
                      </span>
                    </span>
                    <span className="text-sm text-tekst-2">
                      {opisDana(t.datum)} · {t.serije.length} serija
                      {volumen > 0 ? ` · ${Math.round(volumen).toLocaleString("hr-HR")} kg` : ""}
                    </span>
                  </span>
                  <span className="text-tekst-2" aria-hidden="true">
                    {jeOtvoren ? "▴" : "▾"}
                  </span>
                </button>
                {jeOtvoren && (
                  <div className="flex flex-col gap-1.5 border-t border-rub px-3 py-2.5 text-sm">
                    {poVjezbi.size === 0 ? (
                      <p className="text-tekst-2">Nema upisanih serija.</p>
                    ) : (
                      [...poVjezbi.values()].map((serije) => (
                        <p key={serije[0].vjezbaId}>
                          <span className="font-semibold">{serije[0].vjezba}:</span>{" "}
                          <span className="tabular-nums text-tekst-2">
                            {serije.map((s) => `${s.ponavljanja}×${formatG(s.kg)}`).join(", ")} kg
                          </span>
                        </p>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {treninzi.length === broj && (
            <button
              type="button"
              onClick={() => setBroj((b) => b + KORAK)}
              className="self-start text-sm text-tekst-2 underline"
            >
              Prikaži starije
            </button>
          )}
        </>
      )}
    </Kartica>
  );
}
