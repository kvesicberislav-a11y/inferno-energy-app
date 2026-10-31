"use client";

import { useCallback, useEffect, useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka, Ucitavanje } from "@/components/ui";
import { danasZagreb } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

/** Praćene vježbe klijenta (za izvještaj i graf napretka). Prazno = sve vježbe. */
export function usePraceneVjezbe(klijentId: string) {
  const [stanje, setStanje] = useState<{ za: string; ids: Set<string> } | null>(null);
  const [verzija, setVerzija] = useState(0);
  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("pracene_vjezbe")
      .select("vjezba_id")
      .eq("klijent_id", klijentId)
      .then(({ data }) => {
        if (aktivno) setStanje({ za: klijentId, ids: new Set((data ?? []).map((r) => String(r.vjezba_id))) });
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId, verzija]);
  const osvjezi = useCallback(() => setVerzija((v) => v + 1), []);
  const spremno = stanje?.za === klijentId;
  return { ucitano: spremno, ids: spremno ? stanje.ids : new Set<string>(), osvjezi };
}

type VjezbaKlijenta = { id: string; naziv: string; skupina: string; treninga: number };

/** Trener bira koje vježbe klijenta prati u izvještaju i grafu napretka. */
export function OdabirPracenih({
  klijentId,
  odabrane,
  onPromjena,
  onZatvori,
}: {
  klijentId: string;
  odabrane: Set<string>;
  onPromjena: (ids: Set<string>) => void;
  onZatvori: () => void;
}) {
  const [vjezbe, setVjezbe] = useState<VjezbaKlijenta[] | null>(null);
  const [ids, setIds] = useState<Set<string>>(() => new Set(odabrane));
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  useEffect(() => {
    let aktivno = true;
    // sve vježbe koje je klijent ikad radio, najčešće prve
    supabase()
      .rpc("napredak_vjezbi", { p_klijent: klijentId, p_od: "2000-01-01", p_do: danasZagreb() })
      .then(({ data, error }) => {
        if (!aktivno) return;
        if (error) setGreska(prevediGresku(error.message));
        const po = new Map<string, VjezbaKlijenta>();
        for (const r of (data as Record<string, unknown>[] | null) ?? []) {
          const id = String(r.vjezba_id);
          const v = po.get(id) ?? { id, naziv: String(r.naziv), skupina: String(r.misicna_skupina ?? ""), treninga: 0 };
          v.treninga += 1;
          po.set(id, v);
        }
        setVjezbe([...po.values()].sort((a, b) => b.treninga - a.treninga || a.naziv.localeCompare(b.naziv, "hr")));
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId]);

  async function postavi(nove: Set<string>) {
    const dodane = [...nove].filter((x) => !ids.has(x));
    const maknute = [...ids].filter((x) => !nove.has(x));
    const stare = ids;
    setIds(nove);
    setGreska(null);
    setRadi(true);
    const sb = supabase().from("pracene_vjezbe");
    const rez = await Promise.all([
      dodane.length
        ? sb.upsert(dodane.map((v) => ({ klijent_id: klijentId, vjezba_id: v })), { ignoreDuplicates: true })
        : Promise.resolve({ error: null }),
      maknute.length
        ? supabase().from("pracene_vjezbe").delete().eq("klijent_id", klijentId).in("vjezba_id", maknute)
        : Promise.resolve({ error: null }),
    ]);
    setRadi(false);
    const g = rez.find((r) => r.error)?.error;
    if (g) {
      setIds(stare);
      return setGreska(prevediGresku(g.message));
    }
    onPromjena(nove);
  }

  function promijeni(id: string) {
    const n = new Set(ids);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    void postavi(n);
  }

  return (
    <Ploca naslov={`Praćene vježbe (${ids.size})`} onZatvori={onZatvori}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-tekst-2">
          Označi vježbe čiji napredak želiš u izvještaju i grafu. Ništa označeno = sve vježbe.
        </p>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {vjezbe === null ? (
          <Ucitavanje />
        ) : vjezbe.length === 0 ? (
          <Poruka>Klijent još nema upisanih serija.</Poruka>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Gumb varijanta="sporedni" malen disabled={radi} onClick={() => postavi(new Set(vjezbe.map((v) => v.id)))}>
                Označi sve
              </Gumb>
              <Gumb varijanta="sporedni" malen disabled={radi || ids.size === 0} onClick={() => postavi(new Set())}>
                Očisti
              </Gumb>
            </div>
            <div className="flex flex-col gap-2">
              {vjezbe.map((v) => {
                const da = ids.has(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => promijeni(v.id)}
                    aria-pressed={da}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                      da ? "border-vatra bg-vatra/10" : "border-rub bg-povrsina-2"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base font-bold ${
                        da ? "bg-vatra text-white" : "border border-rub text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block leading-snug font-semibold">{v.naziv}</span>
                      <span className="block text-sm text-tekst-2">
                        {v.skupina} · {v.treninga} {v.treninga === 1 ? "trening" : "treninga"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <Gumb onClick={onZatvori}>Gotovo</Gumb>
      </div>
    </Ploca>
  );
}
