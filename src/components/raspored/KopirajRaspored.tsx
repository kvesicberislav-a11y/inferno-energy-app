"use client";

import { useEffect, useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Cip, Gumb, Poruka, Ucitavanje } from "@/components/ui";
import { danMjesec, dodajDane } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import type { Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { DANI_KRATKO } from "@/lib/treninzi";
import { useRaspored } from "./useRaspored";

const kljucMjesta = (klijentId: string, datum: string, vrijeme: string) => `${klijentId}|${datum}|${vrijeme}`;

/**
 * Kopiranje rasporeda u tjedan koji se gleda: termini odabranog ranijeg tjedna (isti dan i vrijeme)
 * dolaze kao jednokratni termini, pa ih trener prilagodi. Preskaču se otkazani termini,
 * arhivirani klijenti i termini koji u ovom tjednu već postoje (isti klijent, dan i vrijeme).
 */
export function KopirajRaspored({
  pon,
  postojeci,
  onGotovo,
  onZatvori,
}: {
  pon: string;
  /** svi termini tjedna u koji se kopira */
  postojeci: Termin[];
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const [unazad, setUnazad] = useState(1);
  const [aktivni, setAktivni] = useState<Set<string> | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const izvorPon = dodajDane(pon, -7 * unazad);
  const { raspored: izvor } = useRaspored(null, izvorPon, dodajDane(izvorPon, 6));

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("profili")
      .select("id")
      .eq("uloga", "klijent")
      .eq("aktivan", true)
      .then(({ data, error }) => {
        if (!aktivno) return;
        if (error) setGreska(prevediGresku(error.message));
        setAktivni(new Set((data ?? []).map((r) => String(r.id))));
      });
    return () => {
      aktivno = false;
    };
  }, []);

  const vec = new Set(postojeci.map((t) => kljucMjesta(t.klijentId, t.datum, t.vrijeme)));
  const novi =
    izvor && aktivni
      ? [
          ...new Map(
            izvor.termini
              .filter((t) => !t.otkazan && aktivni.has(t.klijentId))
              .map((t) => ({ ...t, datum: dodajDane(t.datum, 7 * unazad) }))
              .filter((t) => !vec.has(kljucMjesta(t.klijentId, t.datum, t.vrijeme)))
              .map((t) => [kljucMjesta(t.klijentId, t.datum, t.vrijeme), t] as const),
          ).values(),
        ].sort((a, b) => (a.datum + a.vrijeme).localeCompare(b.datum + b.vrijeme))
      : null;
  const klijenata = new Set((novi ?? []).map((t) => t.klijentId)).size;

  async function kopiraj() {
    if (!novi?.length) return;
    setGreska(null);
    setRadi(true);
    const { error } = await supabase()
      .from("termini_dodatni")
      .insert(novi.map((t) => ({ klijent_id: t.klijentId, datum: t.datum, vrijeme: t.vrijeme, trajanje_min: t.trajanje })));
    setRadi(false);
    if (error) return setGreska(prevediGresku(error.message));
    onGotovo(
      `Kopirano ${novi.length} ${novi.length === 1 ? "termin" : "termina"} s tjedna ${danMjesec(izvorPon)} – ${danMjesec(
        dodajDane(izvorPon, 6),
      )}. Prilagodi ih, pa po želji „Kopiraj planove”.`,
    );
  }

  return (
    <Ploca naslov="Kopiraj raspored" onZatvori={onZatvori}>
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

        {!novi || !izvor ? (
          <Ucitavanje />
        ) : novi.length === 0 ? (
          <p className="text-sm text-tekst-2">
            {izvor.termini.some((t) => !t.otkazan)
              ? "Svi termini tog tjedna već su u ovom tjednu."
              : "U tom tjednu nema termina."}
          </p>
        ) : (
          <>
            <p className="text-sm text-tekst-2">
              Dolazi {novi.length} {novi.length === 1 ? "termin" : "termina"} ({klijenata}{" "}
              {klijenata === 1 ? "klijent" : "klijenata"}), na iste dane i u ista vremena, kao „samo jednom”. Poslije ih
              možeš pomaknuti ili obrisati.
            </p>
            <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-2xl border border-rub bg-povrsina-2 p-3 text-sm">
              {Array.from({ length: 7 }, (_, i) => dodajDane(pon, i)).map((d, i) => {
                const dana = novi.filter((t) => t.datum === d);
                return dana.length ? (
                  <p key={d}>
                    <span className="font-semibold">{DANI_KRATKO[i]}</span>{" "}
                    <span className="text-tekst-2">
                      {dana.map((t) => `${(izvor.imena[t.klijentId] ?? "Klijent").split(" ")[0]} ${t.vrijeme}`).join(", ")}
                    </span>
                  </p>
                ) : null;
              })}
            </div>
          </>
        )}

        {(greska || izvor?.greska) && <Poruka tip="greska">{greska ?? izvor?.greska}</Poruka>}
        <Gumb onClick={kopiraj} disabled={radi || !novi?.length}>
          {radi ? "Kopiram…" : novi?.length ? `Kopiraj ${novi.length} ${novi.length === 1 ? "termin" : "termina"}` : "Kopiraj"}
        </Gumb>
      </div>
    </Ploca>
  );
}
