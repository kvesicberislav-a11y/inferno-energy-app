"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Ploca } from "@/components/Ploca";
import { ProizvodBarkoda, type DodaniProizvod } from "./ProizvodBarkoda";
import { SkenerBarkoda } from "./SkenerBarkoda";
import { Gumb, Poruka } from "@/components/ui";
import { opisDana, satZagreb } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import {
  PRIJEDLOZI_OBROKA,
  formatG,
  formatKcal,
  kcalIz,
  obrokPremaSatu,
  parsirajBroj,
  type Makroi,
  type Obrok,
} from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";

type Nedavni = Makroi & { naziv: string };

function PoljeGrama({
  id,
  oznaka,
  vrijednost,
  promjena,
  autoFocus,
}: {
  id: string;
  oznaka: string;
  vrijednost: string;
  promjena: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex flex-col items-center gap-1.5">
      <span className="text-sm font-medium text-tekst-2">{oznaka}</span>
      <div className="relative w-full">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          placeholder="0"
          autoFocus={autoFocus}
          value={vrijednost}
          onChange={(e) => promjena(e.target.value)}
          onFocus={(e) => e.target.select()}
          className="h-16 w-full rounded-2xl border border-rub bg-povrsina-2 pr-7 pl-3 text-center text-2xl font-semibold tabular-nums text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-tekst-2">
          g
        </span>
      </div>
    </label>
  );
}

/** Brzi unos ili izmjena obroka. */
export function UnosObroka({
  klijentId,
  datum,
  postojeci,
  onZatvori,
  onSpremljeno,
}: {
  klijentId: string;
  datum: string;
  postojeci: Obrok | null;
  onZatvori: () => void;
  onSpremljeno: () => void;
}) {
  const [naziv, setNaziv] = useState(() => postojeci?.naziv ?? obrokPremaSatu(satZagreb()));
  const [p, setP] = useState(postojeci ? formatG(postojeci.proteini) : "");
  const [uh, setUh] = useState(postojeci ? formatG(postojeci.ugljikohidrati) : "");
  const [m, setM] = useState(postojeci ? formatG(postojeci.masti) : "");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);
  const [nedavni, setNedavni] = useState<Nedavni[]>([]);
  const [skener, setSkener] = useState<null | "kamera" | { barkod: string }>(null);
  const [dodani, setDodani] = useState<DodaniProizvod[]>([]);

  // Nedavni obroci za unos jednim dodirom (samo kod novog obroka).
  useEffect(() => {
    if (postojeci) return;
    let aktivno = true;
    supabase()
      .from("obroci")
      .select("naziv, proteini, ugljikohidrati, masti")
      .eq("klijent_id", klijentId)
      .order("kreirano", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (!aktivno || !data) return;
        const vidjeni = new Set<string>();
        const jedinstveni: Nedavni[] = [];
        for (const red of data) {
          const n: Nedavni = {
            naziv: String(red.naziv),
            proteini: Number(red.proteini),
            ugljikohidrati: Number(red.ugljikohidrati),
            masti: Number(red.masti),
          };
          const kljuc = `${n.naziv}|${n.proteini}|${n.ugljikohidrati}|${n.masti}`;
          if (vidjeni.has(kljuc)) continue;
          vidjeni.add(kljuc);
          jedinstveni.push(n);
          if (jedinstveni.length === 6) break;
        }
        setNedavni(jedinstveni);
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId, postojeci]);

  const vrijednosti = { proteini: parsirajBroj(p), ugljikohidrati: parsirajBroj(uh), masti: parsirajBroj(m) };
  const kcal = kcalIz({
    proteini: vrijednosti.proteini ?? 0,
    ugljikohidrati: vrijednosti.ugljikohidrati ?? 0,
    masti: vrijednosti.masti ?? 0,
  });

  function dodajProizvod(x: DodaniProizvod) {
    const zbroji = (staro: string, dodatak: number) => formatG((parsirajBroj(staro) ?? 0) + dodatak);
    setP((v) => zbroji(v, x.proteini));
    setUh((v) => zbroji(v, x.ugljikohidrati));
    setM((v) => zbroji(v, x.masti));
    setDodani((d) => [...d, x]);
    setSkener(null);
  }

  function popuni(n: Nedavni) {
    setNaziv(n.naziv);
    setP(formatG(n.proteini));
    setUh(formatG(n.ugljikohidrati));
    setM(formatG(n.masti));
  }

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    const { proteini, ugljikohidrati, masti } = vrijednosti;
    if (proteini === null || ugljikohidrati === null || masti === null) {
      return setGreska("Upiši ispravne brojeve (npr. 25 ili 12,5).");
    }
    if (proteini > 1000 || ugljikohidrati > 1000 || masti > 1000) {
      return setGreska("Najviše 1000 g po makronutrijentu.");
    }
    if (proteini + ugljikohidrati + masti === 0) {
      return setGreska("Upiši barem jedan makronutrijent.");
    }
    const ime = naziv.trim() || "Obrok";

    setSalje(true);
    const sb = supabase();
    const podaci = { naziv: ime.slice(0, 60), proteini, ugljikohidrati, masti };
    const { error } = postojeci
      ? await sb.from("obroci").update(podaci).eq("id", postojeci.id)
      : await sb.from("obroci").insert({ ...podaci, datum });
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    onSpremljeno();
  }

  async function obrisi() {
    if (!postojeci || !window.confirm(`Obrisati obrok „${postojeci.naziv}”?`)) return;
    setSalje(true);
    const { error } = await supabase().from("obroci").delete().eq("id", postojeci.id);
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    onSpremljeno();
  }

  return (
    <Ploca naslov={postojeci ? "Uredi obrok" : "Novi obrok"} onZatvori={onZatvori}>
      <form onSubmit={spremi} className="flex flex-col gap-5">
        <p className="-mt-2 text-sm text-tekst-2">{opisDana(datum)}</p>

        <Gumb type="button" varijanta="sporedni" onClick={() => setSkener("kamera")}>
          📷 Skeniraj barkod
        </Gumb>

        {nedavni.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-tekst-2">Nedavno (dodir za popunjavanje)</span>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {nedavni.map((n) => (
                <button
                  key={`${n.naziv}|${n.proteini}|${n.ugljikohidrati}|${n.masti}`}
                  type="button"
                  onClick={() => popuni(n)}
                  className="shrink-0 rounded-2xl border border-rub bg-povrsina-2 px-3 py-2 text-left active:scale-[0.98]"
                >
                  <span className="block max-w-36 truncate text-sm font-semibold">{n.naziv}</span>
                  <span className="block text-xs text-tekst-2 tabular-nums">
                    {formatG(n.proteini)} / {formatG(n.ugljikohidrati)} / {formatG(n.masti)} g
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Naziv obroka</span>
          <div className="grid grid-cols-4 gap-2">
            {PRIJEDLOZI_OBROKA.map((prijedlog) => (
              <button
                key={prijedlog}
                type="button"
                onClick={() => setNaziv(prijedlog)}
                className={`h-11 rounded-xl text-sm font-semibold transition ${
                  naziv === prijedlog
                    ? "bg-vatra text-white"
                    : "border border-rub bg-povrsina-2 text-tekst-2"
                }`}
              >
                {prijedlog}
              </button>
            ))}
          </div>
          <input
            aria-label="Naziv obroka"
            value={naziv}
            maxLength={60}
            onChange={(e) => setNaziv(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="npr. Proteinski shake"
            className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <PoljeGrama id="p" oznaka="Proteini" vrijednost={p} promjena={setP} autoFocus={!postojeci} />
          <PoljeGrama id="uh" oznaka="Ugljikohidrati" vrijednost={uh} promjena={setUh} />
          <PoljeGrama id="m" oznaka="Masti" vrijednost={m} promjena={setM} />
        </div>

        <div className="flex items-baseline justify-center gap-2 rounded-2xl bg-povrsina-2 py-3">
          <span className="text-3xl font-bold tabular-nums">{formatKcal(kcal)}</span>
          <span className="text-tekst-2">kcal</span>
        </div>

        {dodani.length > 0 && (
          <p className="-mt-2 text-sm text-tekst-2">
            Skenirano: {dodani.map((d) => `${d.naziv} ${formatG(d.grami)} g`).join(" · ")}
          </p>
        )}

        {greska && <Poruka tip="greska">{greska}</Poruka>}

        <Gumb type="submit" disabled={salje}>
          {salje ? "Spremam…" : postojeci ? "Spremi promjene" : "Spremi obrok"}
        </Gumb>
        {postojeci && (
          <Gumb type="button" varijanta="opasni" onClick={obrisi} disabled={salje}>
            Obriši obrok
          </Gumb>
        )}
      </form>

      {skener === "kamera" && (
        <SkenerBarkoda onBarkod={(barkod) => setSkener({ barkod })} onZatvori={() => setSkener(null)} />
      )}
      {skener && skener !== "kamera" && (
        <ProizvodBarkoda
          barkod={skener.barkod}
          onDodaj={dodajProizvod}
          onZatvori={() => setSkener(null)}
          onPonovo={() => setSkener("kamera")}
        />
      )}
    </Ploca>
  );
}
