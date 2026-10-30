"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka } from "@/components/ui";
import { opisKilaze } from "@/components/trening/useBazneIKilaze";
import { predlozakPonavljanja, type TreningVjezba } from "@/lib/kalendar";
import { prevediGresku } from "@/lib/greske";
import { formatG, parsirajBroj } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { opisCilja, uSeriju, type Kilaza, type Serija } from "@/lib/treninzi";

type Red = { redni: number; ponavljanja: string; kg: string; spremljeno: Serija | null };

function pocetniRedovi(tv: TreningVjezba, spremljene: Serija[]): Red[] {
  const broj = Math.max(tv.serije, spremljene.reduce((m, s) => Math.max(m, s.redni_broj), 0));
  const pon = predlozakPonavljanja(tv.ponavljanja);
  const kg = tv.kg !== null && tv.kg > 0 ? formatG(tv.kg) : "";
  return Array.from({ length: broj }, (_, i) => {
    const s = spremljene.find((x) => x.redni_broj === i + 1) ?? null;
    return { redni: i + 1, ponavljanja: s ? String(s.ponavljanja) : pon, kg: s ? formatG(s.kg) : kg, spremljeno: s };
  });
}

const promijenjen = (r: Red) =>
  !r.spremljeno || r.ponavljanja !== String(r.spremljeno.ponavljanja) || r.kg !== formatG(r.spremljeno.kg);

/** Trener na treningu upisuje koliko je klijent stvarno napravio (serija po serija). */
export function UpisSerija({
  klijentId,
  treningId,
  tv,
  spremljene,
  kilaza,
  onPromjena,
  onZatvori,
}: {
  klijentId: string;
  treningId: string;
  tv: TreningVjezba;
  spremljene: Serija[];
  kilaza: Kilaza | null;
  onPromjena: () => void;
  onZatvori: () => void;
}) {
  const [redovi, setRedovi] = useState<Red[]>(() => pocetniRedovi(tv, spremljene));
  const [radi, setRadi] = useState<number | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  function promijeni(i: number, polje: "ponavljanja" | "kg", vrijednost: string) {
    setRedovi((rr) => rr.map((r, j) => (j === i ? { ...r, [polje]: vrijednost } : r)));
  }

  async function spremi(i: number) {
    const r = redovi[i];
    setGreska(null);
    const ponavljanja = r.ponavljanja.trim() === "" ? null : Number(r.ponavljanja.trim());
    if (ponavljanja === null || !Number.isInteger(ponavljanja) || ponavljanja < 0 || ponavljanja > 1000) {
      return setGreska(`Serija ${r.redni}: upiši broj ponavljanja.`);
    }
    const kg = parsirajBroj(r.kg);
    if (kg === null || kg > 1000) return setGreska(`Serija ${r.redni}: kilaža nije ispravna.`);
    setRadi(i);
    const { data, error } = await supabase()
      .from("odradjene_serije")
      .upsert(
        {
          klijent_id: klijentId,
          trening_id: treningId,
          vjezba_id: tv.vjezba_id,
          plan_vjezba_id: null,
          redni_broj: r.redni,
          ponavljanja,
          kg,
        },
        { onConflict: "trening_id,plan_vjezba_id,vjezba_id,redni_broj" },
      )
      .select()
      .single();
    setRadi(null);
    if (error || !data) return setGreska(prevediGresku(error?.message));
    const s = uSeriju(data);
    setRedovi((rr) =>
      rr.map((x, j) => (j === i ? { ...x, ponavljanja: String(s.ponavljanja), kg: formatG(s.kg), spremljeno: s } : x)),
    );
    onPromjena();
  }

  async function ukloniZadnju() {
    const i = redovi.length - 1;
    const r = redovi[i];
    if (!r || (redovi.length <= 1 && !r.spremljeno)) return;
    if (r.spremljeno) {
      setRadi(i);
      const { error } = await supabase().from("odradjene_serije").delete().eq("id", r.spremljeno.id);
      setRadi(null);
      if (error) return setGreska(prevediGresku(error.message));
      onPromjena();
    }
    // zadnji red ostaje (prazan za ponovni upis), ostali se uklanjaju
    setRedovi((rr) => (rr.length <= 1 ? rr.map((x) => ({ ...x, spremljeno: null })) : rr.slice(0, -1)));
  }

  function dodajSeriju() {
    setRedovi((rr) => {
      const z = rr[rr.length - 1];
      return [...rr, { redni: rr.length + 1, ponavljanja: z?.ponavljanja ?? "", kg: z?.kg ?? "", spremljeno: null }];
    });
  }

  const spremljenih = redovi.filter((r) => r.spremljeno).length;
  const polje =
    "h-14 w-full rounded-2xl border border-rub bg-povrsina-2 text-center text-xl font-semibold tabular-nums text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30";

  return (
    <Ploca naslov={tv.vjezba?.naziv ?? "Vježba"} onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-povrsina-2 px-4 py-3">
          <p className="text-sm text-tekst-2">Plan</p>
          <p className="text-xl font-bold tabular-nums">{opisCilja(tv)}</p>
          {tv.napomena && <p className="mt-1 text-sm text-amber-200">{tv.napomena}</p>}
          <p className="mt-2 text-sm text-tekst-2">{opisKilaze(kilaza)}</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold">Odrađeno</span>
            <span className="text-sm text-tekst-2 tabular-nums">
              {spremljenih}/{redovi.length} serija
            </span>
          </div>
          <div className="grid grid-cols-[1.75rem_1fr_auto_1fr_3rem] items-center gap-x-2 text-xs text-tekst-2">
            <span />
            <span className="text-center">ponavljanja</span>
            <span />
            <span className="text-center">kg</span>
            <span />
          </div>
          {redovi.map((r, i) => {
            const p = promijenjen(r);
            return (
              <div key={r.redni} className="grid grid-cols-[1.75rem_1fr_auto_1fr_3rem] items-center gap-x-2">
                <span className="text-center font-semibold text-tekst-2">{r.redni}</span>
                <input
                  aria-label={`Serija ${r.redni} – ponavljanja`}
                  inputMode="numeric"
                  value={r.ponavljanja}
                  placeholder={tv.ponavljanja}
                  onChange={(e) => promijeni(i, "ponavljanja", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className={polje}
                />
                <span className="text-tekst-2">×</span>
                <input
                  aria-label={`Serija ${r.redni} – kilogrami`}
                  inputMode="decimal"
                  value={r.kg}
                  placeholder="0"
                  onChange={(e) => promijeni(i, "kg", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className={polje}
                />
                <button
                  type="button"
                  aria-label={`Spremi seriju ${r.redni}`}
                  disabled={radi !== null || !p}
                  onClick={() => spremi(i)}
                  className={`flex h-14 w-12 items-center justify-center rounded-2xl text-xl font-bold transition active:scale-95 ${
                    !p ? "bg-emerald-500/20 text-emerald-300" : "bg-linear-to-r from-vatra to-vatra-2 text-white disabled:opacity-50"
                  }`}
                >
                  {radi === i ? "…" : "✓"}
                </button>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Gumb type="button" varijanta="sporedni" malen onClick={dodajSeriju} disabled={radi !== null}>
              + Serija
            </Gumb>
            <Gumb type="button" varijanta="sporedni" malen onClick={ukloniZadnju} disabled={radi !== null || (redovi.length <= 1 && !redovi[0]?.spremljeno)}>
              − Zadnja serija
            </Gumb>
          </div>
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb type="button" onClick={onZatvori}>
          Gotovo
        </Gumb>
      </div>
    </Ploca>
  );
}
