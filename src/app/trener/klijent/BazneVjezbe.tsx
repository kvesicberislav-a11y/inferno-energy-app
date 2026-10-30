"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Cip, Kartica, Poruka, Ucitavanje } from "@/components/ui";
import { kratkoMax, useBazneIKilaze } from "@/components/trening/useBazneIKilaze";
import { filtrirajVjezbe, useVjezbe } from "@/components/vjezbe/useVjezbe";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { MISICNE_SKUPINE, type Kilaza, type Vjezba } from "@/lib/treninzi";

/** Trener: bazne vježbe klijenta – od njih se slaže njegov program. */
export function BazneVjezbe({ klijentId, ime }: { klijentId: string; ime: string }) {
  const { ucitano, bazne, kilaze, greska, osvjezi } = useBazneIKilaze(klijentId);
  const { vjezbe } = useVjezbe({ vrsta: "sve" });
  const [uredivanje, setUredivanje] = useState(false);

  const njegove = (vjezbe ?? []).filter((v) => bazne.has(v.id));
  const poSkupini = MISICNE_SKUPINE.map((s) => ({ s, n: njegove.filter((v) => v.misicna_skupina === s).length })).filter(
    (x) => x.n > 0,
  );

  return (
    <>
      <Kartica className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Bazne vježbe</h3>
            <p className="text-sm text-tekst-2">Vježbe koje {ime.split(" ")[0]} preferira. Od njih slažeš program.</p>
          </div>
          <button type="button" onClick={() => setUredivanje(true)} className="shrink-0 text-sm font-semibold text-vatra">
            {bazne.size ? "Uredi" : "+ Dodaj"}
          </button>
        </div>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {!ucitano || vjezbe === null ? (
          <p className="text-sm text-tekst-2">Učitavam…</p>
        ) : njegove.length === 0 ? (
          <p className="text-sm text-tekst-2">Još nema baznih vježbi.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {poSkupini.map(({ s, n }) => (
              <span key={s} className="rounded-lg bg-povrsina-2 px-2 py-1 text-sm">
                {s} <span className="text-tekst-2">{n}</span>
              </span>
            ))}
          </div>
        )}
      </Kartica>

      {uredivanje && (
        <UrediBazne
          klijentId={klijentId}
          vjezbe={vjezbe}
          bazne={bazne}
          kilaze={kilaze}
          onPromjena={osvjezi}
          onZatvori={() => setUredivanje(false)}
        />
      )}
    </>
  );
}

function UrediBazne({
  klijentId,
  vjezbe,
  bazne,
  kilaze,
  onPromjena,
  onZatvori,
}: {
  klijentId: string;
  vjezbe: Vjezba[] | null;
  bazne: Set<string>;
  kilaze: Map<string, Kilaza>;
  onPromjena: () => void;
  onZatvori: () => void;
}) {
  // lokalno stanje da kvačica reagira odmah (sprema se u pozadini)
  const [odabrane, setOdabrane] = useState<Set<string>>(() => new Set(bazne));
  const [skupina, setSkupina] = useState<string | null>(MISICNE_SKUPINE[0]);
  const [upit, setUpit] = useState("");
  const [samoNjegove, setSamoNjegove] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const dostupne = (vjezbe ?? []).filter((v) => v.vlasnik_id === null || v.vlasnik_id === klijentId);
  const prikazane = filtrirajVjezbe(dostupne, upit, upit ? null : skupina).filter((v) => !samoNjegove || odabrane.has(v.id));

  async function promijeni(v: Vjezba) {
    const bila = odabrane.has(v.id);
    setOdabrane((o) => {
      const n = new Set(o);
      if (bila) n.delete(v.id);
      else n.add(v.id);
      return n;
    });
    setGreska(null);
    const sb = supabase().from("bazne_vjezbe");
    const { error } = bila
      ? await sb.delete().eq("klijent_id", klijentId).eq("vjezba_id", v.id)
      : await sb.upsert({ klijent_id: klijentId, vjezba_id: v.id }, { ignoreDuplicates: true });
    if (error) {
      setGreska(prevediGresku(error.message));
      setOdabrane((o) => {
        const n = new Set(o);
        if (bila) n.add(v.id);
        else n.delete(v.id);
        return n;
      });
      return;
    }
    onPromjena();
  }

  return (
    <Ploca naslov={`Bazne vježbe (${odabrane.size})`} onZatvori={onZatvori}>
      <div className="flex flex-col gap-3">
        <input
          type="search"
          aria-label="Pretraži vježbe"
          placeholder="Pretraži sve vježbe…"
          value={upit}
          onChange={(e) => setUpit(e.target.value)}
          className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
        />
        {!upit && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {MISICNE_SKUPINE.map((s) => {
              const n = dostupne.filter((v) => v.misicna_skupina === s && odabrane.has(v.id)).length;
              return (
                <Cip key={s} aktivan={skupina === s} onClick={() => setSkupina(s)}>
                  {s}
                  {n ? ` · ${n}` : ""}
                </Cip>
              );
            })}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-tekst-2">
          <input type="checkbox" checked={samoNjegove} onChange={(e) => setSamoNjegove(e.target.checked)} className="h-5 w-5 accent-vatra" />
          Prikaži samo odabrane
        </label>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {vjezbe === null ? (
          <Ucitavanje />
        ) : prikazane.length === 0 ? (
          <Poruka>Nema vježbi.</Poruka>
        ) : (
          <div className="flex flex-col gap-2">
            {prikazane.map((v) => {
              const da = odabrane.has(v.id);
              const max = kratkoMax(kilaze.get(v.id));
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => promijeni(v)}
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
                    {(max || upit || v.vlasnik_id) && (
                      <span className="block text-sm text-tekst-2">
                        {[upit ? v.misicna_skupina : null, max, v.vlasnik_id ? "njegova vježba" : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Ploca>
  );
}
