"use client";

import { useState, type FormEvent } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Polje, Poruka } from "@/components/ui";
import { formatG, parsirajBroj } from "@/lib/makroi";
import type { Vjezba } from "@/lib/treninzi";

export type PodaciPlanVjezbe = {
  serije: number;
  ponavljanja: string;
  kg: number | null;
  napomena: string;
};

/** Serije × ponavljanja × kg i napomena za jednu vježbu u planu. */
export function PlanVjezbaForma({
  vjezba,
  pocetno,
  onSpremi,
  onUkloni,
  onZatvori,
}: {
  vjezba: Vjezba;
  pocetno: PodaciPlanVjezbe | null;
  onSpremi: (p: PodaciPlanVjezbe) => Promise<string | null>;
  onUkloni?: () => Promise<string | null>;
  onZatvori: () => void;
}) {
  const [serije, setSerije] = useState(pocetno?.serije ?? 3);
  const [ponavljanja, setPonavljanja] = useState(pocetno?.ponavljanja ?? "10");
  const [kg, setKg] = useState(pocetno?.kg != null ? formatG(pocetno.kg) : "");
  const [napomena, setNapomena] = useState(pocetno?.napomena ?? "");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    const kgBroj = kg.trim() ? parsirajBroj(kg) : null;
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
    if (!onUkloni || !window.confirm(`Ukloniti „${vjezba.naziv}” iz plana?`)) return;
    setSalje(true);
    const g = await onUkloni();
    setSalje(false);
    if (g) setGreska(g);
  }

  return (
    <Ploca naslov={vjezba.naziv} onZatvori={onZatvori}>
      <form onSubmit={spremi} className="flex flex-col gap-5">
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
          {salje ? "Spremam…" : pocetno ? "Spremi" : "Dodaj u plan"}
        </Gumb>
        {onUkloni && (
          <Gumb type="button" varijanta="opasni" onClick={ukloni} disabled={salje}>
            Ukloni iz plana
          </Gumb>
        )}
      </form>
    </Ploca>
  );
}
