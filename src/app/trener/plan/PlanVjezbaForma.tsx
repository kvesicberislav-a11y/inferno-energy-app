"use client";

import { useState, type FormEvent } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Polje, Poruka } from "@/components/ui";
import { opisKilaze } from "@/components/trening/useBazneIKilaze";
import { formatG, parsirajBroj } from "@/lib/makroi";
import { KORAK_KG, type Kilaza, type Vjezba } from "@/lib/treninzi";

export type PodaciPlanVjezbe = {
  serije: number;
  ponavljanja: string;
  kg: number | null;
  napomena: string;
};

/** Serije × ponavljanja × kg i napomena za jednu vježbu u programu. */
export function PlanVjezbaForma({
  vjezba,
  pocetno,
  kilaza,
  onSpremi,
  onUkloni,
  onPomakni,
  onZatvori,
}: {
  vjezba: Vjezba;
  pocetno: PodaciPlanVjezbe | null;
  /** najveća i zadnja kilaža klijenta na ovoj vježbi */
  kilaza: Kilaza | null;
  onSpremi: (p: PodaciPlanVjezbe) => Promise<string | null>;
  onUkloni?: () => Promise<string | null>;
  /** pomak unutar skupine (null = ne može u tom smjeru) */
  onPomakni?: { gore: (() => void) | null; dolje: (() => void) | null };
  onZatvori: () => void;
}) {
  const [serije, setSerije] = useState(pocetno?.serije ?? 3);
  const [ponavljanja, setPonavljanja] = useState(pocetno?.ponavljanja ?? "10");
  const [kg, setKg] = useState(pocetno?.kg != null ? formatG(pocetno.kg) : "");
  const [napomena, setNapomena] = useState(pocetno?.napomena ?? "");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  const kgBroj = kg.trim() ? parsirajBroj(kg) : null;
  function pomakniKg(smjer: -1 | 1) {
    const sada = kgBroj ?? 0;
    const nova = Math.round((sada + smjer * KORAK_KG) * 10) / 10;
    setKg(nova > 0 ? formatG(Math.min(1000, nova)) : "");
  }

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    if (kg.trim() && kgBroj === null) return setGreska("Kilaža nije ispravan broj.");
    if (!ponavljanja.trim()) return setGreska("Upiši broj ponavljanja (npr. 10 ili 8-10).");
    setSalje(true);
    const g = await onSpremi({
      serije,
      ponavljanja: ponavljanja.trim().slice(0, 20),
      kg: kgBroj,
      napomena: napomena.trim().slice(0, 300),
    });
    setSalje(false);
    if (g) setGreska(g);
  }

  async function ukloni() {
    if (!onUkloni || !window.confirm(`Ukloniti „${vjezba.naziv}” iz programa?`)) return;
    setSalje(true);
    const g = await onUkloni();
    setSalje(false);
    if (g) setGreska(g);
  }

  const malaTipka =
    "h-11 rounded-xl border border-rub bg-povrsina-2 px-2 text-sm font-semibold text-tekst active:scale-95 disabled:opacity-40";

  return (
    <Ploca naslov={vjezba.naziv} onZatvori={onZatvori}>
      <form onSubmit={spremi} className="flex flex-col gap-5">
        <div className="rounded-2xl bg-povrsina-2 px-4 py-3 text-sm text-tekst-2">{opisKilaze(kilaza)}</div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Serije</span>
          <div className="flex items-center gap-3">
            <Gumb
              type="button"
              varijanta="sporedni"
              malen
              className="w-14 text-2xl"
              onClick={() => setSerije((s) => Math.max(1, s - 1))}
              aria-label="Manje serija"
            >
              −
            </Gumb>
            <span className="w-12 text-center text-3xl font-bold tabular-nums">{serije}</span>
            <Gumb
              type="button"
              varijanta="sporedni"
              malen
              className="w-14 text-2xl"
              onClick={() => setSerije((s) => Math.min(20, s + 1))}
              aria-label="Više serija"
            >
              +
            </Gumb>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Polje
            id="pv-ponavljanja"
            oznaka="Ponavljanja"
            placeholder="npr. 8-10"
            maxLength={20}
            value={ponavljanja}
            onChange={(e) => setPonavljanja(e.target.value)}
          />
          <Polje
            id="pv-kg"
            oznaka="Kg (neobavezno)"
            inputMode="decimal"
            placeholder="—"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
          />
        </div>
        <div className="-mt-2 grid grid-cols-3 gap-2">
          <button type="button" className={malaTipka} onClick={() => pomakniKg(-1)} disabled={!kgBroj}>
            − {formatG(KORAK_KG)} kg
          </button>
          <button
            type="button"
            className={malaTipka}
            onClick={() => kilaza?.maxKg != null && setKg(formatG(kilaza.maxKg))}
            disabled={kilaza?.maxKg == null}
          >
            = max{kilaza?.maxKg != null ? ` ${formatG(kilaza.maxKg)}` : ""}
          </button>
          <button type="button" className={malaTipka} onClick={() => pomakniKg(1)}>
            + {formatG(KORAK_KG)} kg
          </button>
        </div>
        <Polje
          id="pv-napomena"
          oznaka="Napomena (neobavezno)"
          placeholder="npr. sporo spuštanje, 90 s odmora"
          maxLength={300}
          value={napomena}
          onChange={(e) => setNapomena(e.target.value)}
        />
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb type="submit" disabled={salje}>
          {salje ? "Spremam…" : pocetno ? "Spremi" : "Dodaj u program"}
        </Gumb>
        {onPomakni && (onPomakni.gore || onPomakni.dolje) && (
          <div className="grid grid-cols-2 gap-3">
            <Gumb type="button" varijanta="sporedni" malen onClick={onPomakni.gore ?? undefined} disabled={!onPomakni.gore || salje}>
              ▲ Ranije
            </Gumb>
            <Gumb type="button" varijanta="sporedni" malen onClick={onPomakni.dolje ?? undefined} disabled={!onPomakni.dolje || salje}>
              ▼ Kasnije
            </Gumb>
          </div>
        )}
        {onUkloni && (
          <Gumb type="button" varijanta="opasni" onClick={ukloni} disabled={salje}>
            Ukloni iz programa
          </Gumb>
        )}
      </form>
    </Ploca>
  );
}
