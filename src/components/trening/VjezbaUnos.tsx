"use client";

import { useEffect, useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka } from "@/components/ui";
import { OdabirVjezbe } from "@/components/vjezbe/OdabirVjezbe";
import { VideoVjezbe } from "@/components/vjezbe/VideoVjezbe";
import { VjezbaForma } from "@/components/vjezbe/VjezbaForma";
import { prevediGresku } from "@/lib/greske";
import { formatG, parsirajBroj } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import {
  DANI,
  opisCilja,
  prviBroj,
  serijaZaMjesto,
  uSeriju,
  type PlanDan,
  type PlanVjezba,
  type Serija,
  type Trening,
  type Vjezba,
} from "@/lib/treninzi";

type Red = { redni: number; ponavljanja: string; kg: string; spremljeno: Serija | null };

function pocetniRedovi(pv: PlanVjezba, spremljene: Serija[], jeZamjena: boolean): Red[] {
  const broj = Math.max(pv.serije, spremljene.reduce((m, s) => Math.max(m, s.redni_broj), 0));
  const ponCilj = /^\s*\d+\s*$/.test(pv.ponavljanja) ? String(prviBroj(pv.ponavljanja)) : "";
  // Kilaža iz plana ne vrijedi za zamjensku spravu.
  const kgCilj = !jeZamjena && pv.kg !== null && pv.kg > 0 ? formatG(pv.kg) : "";
  return Array.from({ length: broj }, (_, i) => {
    const s = spremljene.find((x) => x.redni_broj === i + 1) ?? null;
    return {
      redni: i + 1,
      ponavljanja: s ? String(s.ponavljanja) : ponCilj,
      kg: s ? formatG(s.kg) : kgCilj,
      spremljeno: s,
    };
  });
}

function jePromijenjen(r: Red) {
  if (!r.spremljeno) return true;
  return r.ponavljanja !== String(r.spremljeno.ponavljanja) || r.kg !== formatG(r.spremljeno.kg);
}

/** Vježba iz današnjeg treninga: video, opis, unos serija i zamjena vježbe. */
export function VjezbaUnos({
  klijentId,
  pv,
  zamjena,
  dan,
  datum,
  trening,
  onPromjena,
  onZatvori,
}: {
  klijentId: string;
  pv: PlanVjezba;
  /** vježba kojom je klijent zamijenio onu iz plana (ili null) */
  zamjena: Vjezba | null;
  dan: PlanDan;
  datum: string;
  trening: Trening | null;
  onPromjena: () => void;
  onZatvori: () => void;
}) {
  const izvorna = pv.vjezba;
  const vjezba = zamjena ?? izvorna;
  const vjezbaId = zamjena?.id ?? pv.vjezba_id;

  const [treningId, setTreningId] = useState<string | null>(trening?.id ?? null);
  // Trening kakav je bio pri otvaranju – "prošli put" se računa samo jednom.
  const [pocetniTreningId] = useState<string | null>(trening?.id ?? null);
  const [redovi, setRedovi] = useState<Red[]>(() =>
    pocetniRedovi(
      pv,
      (trening?.serije ?? []).filter((s) => serijaZaMjesto(s, pv, zamjena?.id ?? pv.vjezba_id)),
      zamjena !== null,
    ),
  );
  const [prosliPut, setProsliPut] = useState<Serija[] | null>(null);
  const [radi, setRadi] = useState<number | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [biranjeZamjene, setBiranjeZamjene] = useState(false);
  const [novaVlastita, setNovaVlastita] = useState(false);
  const [mijenja, setMijenja] = useState(false);

  // Što je klijent odradio prošli put na ovoj vježbi (za usporedbu i predložak).
  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("odradjene_serije")
      .select("*")
      .eq("klijent_id", klijentId)
      .eq("vjezba_id", vjezbaId)
      .order("kreirano", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (!aktivno || !data) return;
        const serije = data.map(uSeriju).filter((s) => s.trening_id !== pocetniTreningId);
        const zadnjiTrening = serije[0]?.trening_id;
        const zadnje = serije
          .filter((s) => s.trening_id === zadnjiTrening)
          .sort((a, b) => a.redni_broj - b.redni_broj);
        setProsliPut(zadnje);
        if (zadnje.length) {
          // Nespremljene serije popuni onim što je bilo prošli put.
          setRedovi((rr) =>
            rr.map((r) => {
              if (r.spremljeno) return r;
              const p = zadnje.find((s) => s.redni_broj === r.redni) ?? zadnje[zadnje.length - 1];
              return { ...r, ponavljanja: String(p.ponavljanja), kg: formatG(p.kg) };
            }),
          );
        }
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId, vjezbaId, pocetniTreningId]);

  function promijeni(i: number, polje: "ponavljanja" | "kg", vrijednost: string) {
    setRedovi((rr) => rr.map((r, j) => (j === i ? { ...r, [polje]: vrijednost } : r)));
  }

  async function osigurajTrening(): Promise<string> {
    if (treningId) return treningId;
    const { data, error } = await supabase()
      .from("treninzi")
      .upsert(
        {
          klijent_id: klijentId,
          datum,
          plan_dan_id: dan.id,
          naziv: dan.naziv || DANI[dan.dan_u_tjednu - 1],
        },
        { onConflict: "klijent_id,datum,plan_dan_id" },
      )
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Trening nije spremljen.");
    setTreningId(String(data.id));
    return String(data.id);
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
    try {
      const tId = await osigurajTrening();
      const { data, error } = await supabase()
        .from("odradjene_serije")
        .upsert(
          {
            klijent_id: klijentId,
            trening_id: tId,
            vjezba_id: vjezbaId,
            plan_vjezba_id: pv.id,
            redni_broj: r.redni,
            ponavljanja,
            kg,
          },
          { onConflict: "trening_id,vjezba_id,redni_broj" },
        )
        .select()
        .single();
      if (error || !data) throw new Error(error?.message ?? "Serija nije spremljena.");
      const s = uSeriju(data);
      setRedovi((rr) =>
        rr.map((x, j) =>
          j === i ? { ...x, ponavljanja: String(s.ponavljanja), kg: formatG(s.kg), spremljeno: s } : x,
        ),
      );
      onPromjena();
    } catch (err) {
      setGreska(prevediGresku(err instanceof Error ? err.message : null));
    } finally {
      setRadi(null);
    }
  }

  async function ukloniZadnju() {
    const i = redovi.length - 1;
    const r = redovi[i];
    if (!r || redovi.length <= 1) return;
    if (r.spremljeno) {
      setRadi(i);
      const { error } = await supabase().from("odradjene_serije").delete().eq("id", r.spremljeno.id);
      setRadi(null);
      if (error) return setGreska(prevediGresku(error.message));
      onPromjena();
    }
    setRedovi((rr) => rr.slice(0, -1));
  }

  function dodajSeriju() {
    setRedovi((rr) => {
      const zadnji = rr[rr.length - 1];
      return [
        ...rr,
        { redni: rr.length + 1, ponavljanja: zadnji?.ponavljanja ?? "", kg: zadnji?.kg ?? "", spremljeno: null },
      ];
    });
  }

  async function postaviZamjenu(v: Vjezba) {
    setBiranjeZamjene(false);
    setNovaVlastita(false);
    setGreska(null);
    setMijenja(true);
    const { error } = await supabase()
      .from("zamjene_vjezbi")
      .upsert(
        { klijent_id: klijentId, plan_vjezba_id: pv.id, vjezba_id: v.id },
        { onConflict: "klijent_id,plan_vjezba_id" },
      );
    setMijenja(false);
    if (error) return setGreska(prevediGresku(error.message));
    onPromjena();
  }

  async function vratiIzvornu() {
    setGreska(null);
    setMijenja(true);
    const { error } = await supabase()
      .from("zamjene_vjezbi")
      .delete()
      .eq("klijent_id", klijentId)
      .eq("plan_vjezba_id", pv.id);
    setMijenja(false);
    if (error) return setGreska(prevediGresku(error.message));
    onPromjena();
  }

  const spremljenih = redovi.filter((r) => r.spremljeno).length;
  const mozeMijenjati = spremljenih === 0 && !mijenja;

  return (
    <Ploca naslov={vjezba?.naziv ?? "Vježba"} onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        {zamjena && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Zamjena za <strong>{izvorna?.naziv ?? "vježbu iz plana"}</strong> (nemaš tu spravu)
          </div>
        )}

        <VideoVjezbe url={vjezba?.youtube_url ?? null} naslov={vjezba?.naziv ?? "Video"} />
        {vjezba?.slika_url && !vjezba.youtube_url && (
          // eslint-disable-next-line @next/next/no-img-element -- slika je već smanjena pri učitavanju
          <img src={vjezba.slika_url} alt={vjezba.naziv} className="w-full rounded-2xl border border-rub" />
        )}

        <div className="rounded-2xl bg-povrsina-2 px-4 py-3">
          <p className="text-sm text-tekst-2">Cilj</p>
          <p className="text-xl font-bold tabular-nums">
            {opisCilja(zamjena ? { ...pv, kg: null } : pv)}
          </p>
          {pv.napomena && <p className="mt-1 text-sm text-amber-200">{pv.napomena}</p>}
          {prosliPut && prosliPut.length > 0 && (
            <p className="mt-2 text-sm text-tekst-2 tabular-nums">
              Prošli put: {prosliPut.map((s) => `${s.ponavljanja}×${formatG(s.kg)}`).join(", ")} kg
            </p>
          )}
        </div>

        {vjezba?.opis && <p className="whitespace-pre-line text-base text-tekst-2">{vjezba.opis}</p>}

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold">Serije</span>
            <span className="text-sm text-tekst-2 tabular-nums">
              {spremljenih}/{redovi.length} odrađeno
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
            const promijenjen = jePromijenjen(r);
            return (
              <div key={r.redni} className="grid grid-cols-[1.75rem_1fr_auto_1fr_3rem] items-center gap-x-2">
                <span className="text-center font-semibold text-tekst-2">{r.redni}</span>
                <input
                  aria-label={`Serija ${r.redni} – ponavljanja`}
                  inputMode="numeric"
                  value={r.ponavljanja}
                  placeholder={pv.ponavljanja}
                  onChange={(e) => promijeni(i, "ponavljanja", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="h-14 w-full rounded-2xl border border-rub bg-povrsina-2 text-center text-xl font-semibold tabular-nums text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
                />
                <span className="text-tekst-2">×</span>
                <input
                  aria-label={`Serija ${r.redni} – kilogrami`}
                  inputMode="decimal"
                  value={r.kg}
                  placeholder="0"
                  onChange={(e) => promijeni(i, "kg", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="h-14 w-full rounded-2xl border border-rub bg-povrsina-2 text-center text-xl font-semibold tabular-nums text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
                />
                <button
                  type="button"
                  aria-label={`Spremi seriju ${r.redni}`}
                  disabled={radi !== null || !promijenjen}
                  onClick={() => spremi(i)}
                  className={`flex h-14 w-12 items-center justify-center rounded-2xl text-xl font-bold transition active:scale-95 ${
                    !promijenjen
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-linear-to-r from-vatra to-vatra-2 text-white disabled:opacity-50"
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
            <Gumb
              type="button"
              varijanta="sporedni"
              malen
              onClick={ukloniZadnju}
              disabled={radi !== null || redovi.length <= 1}
            >
              − Zadnja serija
            </Gumb>
          </div>
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}

        <Gumb type="button" onClick={onZatvori}>
          Gotovo
        </Gumb>

        <div className="flex flex-col gap-2 border-t border-rub pt-4">
          {zamjena ? (
            <Gumb type="button" varijanta="sporedni" onClick={vratiIzvornu} disabled={!mozeMijenjati}>
              Vrati vježbu iz plana
            </Gumb>
          ) : (
            <Gumb
              type="button"
              varijanta="sporedni"
              onClick={() => setBiranjeZamjene(true)}
              disabled={!mozeMijenjati}
            >
              Nemam ovu spravu – zamijeni vježbu
            </Gumb>
          )}
          {spremljenih > 0 && (
            <p className="text-center text-xs text-tekst-2">
              Zamjena je moguća prije upisa serija (ili obriši upisane serije).
            </p>
          )}
        </div>
      </div>

      {biranjeZamjene && (
        <OdabirVjezbe
          naslov="Zamijeni vježbu"
          opseg={{ vrsta: "sve" }}
          iskljuci={[pv.vjezba_id, vjezbaId]}
          onNova={() => {
            setBiranjeZamjene(false);
            setNovaVlastita(true);
          }}
          onOdabir={postaviZamjenu}
          onZatvori={() => setBiranjeZamjene(false)}
        />
      )}

      {novaVlastita && (
        <VjezbaForma
          postojeca={null}
          vlasnikId={klijentId}
          onZatvori={() => setNovaVlastita(false)}
          onSpremljeno={(v) => {
            if (v) postaviZamjenu(v);
            else setNovaVlastita(false);
          }}
        />
      )}
    </Ploca>
  );
}
