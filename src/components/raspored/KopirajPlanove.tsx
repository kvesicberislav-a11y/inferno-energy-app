"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Cip, Gumb, Poruka } from "@/components/ui";
import { danMjesec, dodajDane } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { kljucTreninga } from "@/lib/kalendar";
import type { Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";

/**
 * Kopiranje planova u tjedan koji se gleda: s odabranog ranijeg tjedna (isti dan u tjednu),
 * za sve klijente ili jednu osobu. Termini koji već imaju plan se ne diraju.
 */
export function KopirajPlanove({
  pon,
  termini,
  imena,
  imaPlan,
  pocetniKlijent,
  onGotovo,
  onZatvori,
}: {
  pon: string;
  /** neotkazani termini tjedna */
  termini: Termin[];
  imena: Record<string, string>;
  imaPlan: (klijentId: string, datum: string) => boolean;
  pocetniKlijent: string;
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const [unazad, setUnazad] = useState(1);
  const [klijent, setKlijent] = useState(pocetniKlijent);
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  const klijenti = [...new Set(termini.map((t) => t.klijentId))]
    .map((id) => ({ id, ime: imena[id] ?? "Klijent" }))
    .sort((a, b) => a.ime.localeCompare(b.ime, "hr"));
  // jedan plan po klijentu i danu (dva termina istog dana dijele plan)
  const ciljevi = [
    ...new Map(
      termini
        .filter((t) => (!klijent || t.klijentId === klijent) && !imaPlan(t.klijentId, t.datum))
        .map((t) => [kljucTreninga(t.klijentId, t.datum), t] as const),
    ).values(),
  ];
  const izvorPon = dodajDane(pon, -7 * unazad);

  async function kopiraj() {
    if (ciljevi.length === 0) return;
    setGreska(null);
    setRadi(true);
    const rez = await Promise.all(
      ciljevi.map((t) =>
        supabase().rpc("kopiraj_trening", {
          p_klijent: t.klijentId,
          p_iz: dodajDane(t.datum, -7 * unazad),
          p_u: t.datum,
          p_zamijeni: false,
        }),
      ),
    );
    setRadi(false);
    const g = rez.find((r) => r.error);
    if (g?.error) return setGreska(prevediGresku(g.error.message));
    const kopirano = rez.filter((r) => Number(r.data) > 0).length;
    const bez = ciljevi.length - kopirano;
    onGotovo(
      kopirano
        ? `Kopirano ${kopirano} ${kopirano === 1 ? "trening" : "treninga"} s tjedna ${danMjesec(izvorPon)} – ${danMjesec(
            dodajDane(izvorPon, 6),
          )}.${bez ? ` Za ${bez} termin(a) taj tjedan nije bilo plana na isti dan.` : ""}`
        : `Tjedan ${danMjesec(izvorPon)} – ${danMjesec(dodajDane(izvorPon, 6))} nema planova na iste dane.`,
    );
  }

  return (
    <Ploca naslov="Kopiraj planove" onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">S kojeg tjedna?</span>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((n) => {
              const od = dodajDane(pon, -7 * n);
              return (
                <Cip key={n} aktivan={unazad === n} className="h-auto py-2" onClick={() => setUnazad(n)}>
                  <span className="block">{n === 1 ? "Prošli tjedan" : `Prije ${n} tjedna`}</span>
                  <span className="block text-xs font-normal opacity-80">
                    {danMjesec(od)} – {danMjesec(dodajDane(od, 6))}
                  </span>
                </Cip>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Za koga?</span>
          <select
            value={klijent}
            onChange={(e) => setKlijent(e.target.value)}
            className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-3 text-base text-tekst outline-none focus:border-vatra"
          >
            <option value="">Svi klijenti</option>
            {klijenti.map((k) => (
              <option key={k.id} value={k.id}>
                {k.ime}
              </option>
            ))}
          </select>
        </label>

        <p className="text-sm text-tekst-2">
          {ciljevi.length === 0
            ? "Svi termini ovog tjedna već imaju plan."
            : `Plan se kopira u ${ciljevi.length} ${ciljevi.length === 1 ? "termin" : "termina"} bez plana, s istog dana u odabranom tjednu. Termini koji već imaju plan se ne diraju.`}
        </p>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb onClick={kopiraj} disabled={radi || ciljevi.length === 0}>
          {radi ? "Kopiram…" : "Kopiraj"}
        </Gumb>
      </div>
    </Ploca>
  );
}
