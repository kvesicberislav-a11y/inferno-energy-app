"use client";

import { useState, type FormEvent } from "react";
import { Gumb, Poruka } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

/** Sprema stalnu napomenu klijenta za vježbu (vježba time postaje i njegova bazna). */
export async function spremiStalnuNapomenu(klijentId: string, vjezbaId: string, napomena: string): Promise<string | null> {
  const { error } = await supabase()
    .from("bazne_vjezbe")
    .upsert({ klijent_id: klijentId, vjezba_id: vjezbaId, napomena: napomena.trim().slice(0, 300) }, { onConflict: "klijent_id,vjezba_id" });
  return error ? prevediGresku(error.message) : null;
}

/**
 * Trener: stalna napomena klijenta za vježbu (npr. "sjedalo lvl3, gurat se o spužvu").
 * Prikazuje se na svakom njegovom treningu s tom vježbom; vidi je i klijent.
 */
export function StalnaNapomena({
  klijentId,
  vjezbaId,
  tekst,
  ime,
  onPromjena,
}: {
  klijentId: string;
  vjezbaId: string;
  tekst: string;
  /** ime klijenta (za objašnjenje tko je vidi) */
  ime: string;
  onPromjena: () => void;
}) {
  const [uredivanje, setUredivanje] = useState(false);
  const [vrijednost, setVrijednost] = useState(tekst);
  const [salje, setSalje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setSalje(true);
    setGreska(null);
    const g = await spremiStalnuNapomenu(klijentId, vjezbaId, vrijednost);
    setSalje(false);
    if (g) return setGreska(g);
    setUredivanje(false);
    onPromjena();
  }

  if (!uredivanje) {
    return tekst ? (
      <button
        type="button"
        onClick={() => {
          setVrijednost(tekst);
          setUredivanje(true);
        }}
        className="flex w-full items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-left active:scale-[0.99]"
      >
        <span aria-hidden="true">📌</span>
        <span className="min-w-0 flex-1 text-amber-100">{tekst}</span>
        <span className="shrink-0 text-sm font-semibold text-amber-200">✎</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => {
          setVrijednost("");
          setUredivanje(true);
        }}
        className="flex h-11 w-full items-center justify-center rounded-2xl border border-dashed border-rub text-sm font-semibold text-tekst-2 active:scale-[0.99]"
      >
        📌 + Stalna napomena (npr. sjedalo lvl3)
      </button>
    );
  }

  return (
    <form onSubmit={spremi} className="flex flex-col gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3">
      <label htmlFor={`stalna-${vjezbaId}`} className="text-sm font-semibold text-amber-100">
        📌 Stalna napomena
      </label>
      <input
        id={`stalna-${vjezbaId}`}
        autoFocus
        maxLength={300}
        placeholder="npr. sjedalo lvl3, gurat se o spužvu"
        value={vrijednost}
        onChange={(e) => setVrijednost(e.target.value)}
        className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
      />
      <p className="text-xs text-tekst-2">
        Ostaje uz ovu vježbu na svakom treningu. Vidi je i {ime.split(" ")[0]}.
      </p>
      {greska && <Poruka tip="greska">{greska}</Poruka>}
      <div className="grid grid-cols-2 gap-2">
        <Gumb type="button" varijanta="sporedni" malen onClick={() => setUredivanje(false)} disabled={salje}>
          Odustani
        </Gumb>
        <Gumb type="submit" malen disabled={salje}>
          {salje ? "Spremam…" : "Spremi"}
        </Gumb>
      </div>
    </form>
  );
}

/** Klijent (samo pregled): "📌 sjedalo lvl3" */
export function PrikazStalneNapomene({ tekst, sitno = false }: { tekst: string | undefined; sitno?: boolean }) {
  if (!tekst) return null;
  return sitno ? (
    <span className="block truncate text-xs text-amber-200">📌 {tekst}</span>
  ) : (
    <div className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-100">
      <span aria-hidden="true">📌</span>
      <span className="min-w-0 flex-1">{tekst}</span>
    </div>
  );
}
