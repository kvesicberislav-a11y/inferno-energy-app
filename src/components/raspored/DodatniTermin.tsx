"use client";

import { useEffect, useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Cip, Gumb, Polje, Poruka } from "@/components/ui";
import { danasZagreb } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { opisTermina } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { obavijestiKlijenta } from "./useRaspored";

const POLJE =
  "h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none focus:border-vatra";

/** Trener dodaje jednokratni termin (npr. nadoknada). */
export function DodatniTermin({
  klijentId,
  pocetniDatum,
  onGotovo,
  onZatvori,
}: {
  /** ako je zadan, klijent je već odabran */
  klijentId: string | null;
  pocetniDatum?: string;
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const [klijenti, setKlijenti] = useState<{ id: string; ime: string }[] | null>(null);
  const [odabrani, setOdabrani] = useState<string | null>(klijentId);
  const [datum, setDatum] = useState(pocetniDatum ?? danasZagreb());
  const [vrijeme, setVrijeme] = useState("18:00");
  const [trajanje, setTrajanje] = useState(60);
  const [napomena, setNapomena] = useState("");
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  useEffect(() => {
    if (klijentId) return;
    let aktivno = true;
    supabase()
      .from("profili")
      .select("id, ime, email")
      .eq("uloga", "klijent")
      .eq("nacin", "uzivo")
      .order("ime")
      .then(({ data }) => {
        if (aktivno) setKlijenti((data ?? []).map((k) => ({ id: String(k.id), ime: String(k.ime || k.email) })));
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId]);

  async function spremi() {
    if (!odabrani) return setGreska("Odaberi klijenta.");
    if (!datum || !vrijeme) return setGreska("Odaberi datum i vrijeme.");
    setGreska(null);
    setRadi(true);
    const { error } = await supabase()
      .from("termini_dodatni")
      .insert({ klijent_id: odabrani, datum, vrijeme, trajanje_min: trajanje, napomena: napomena.trim().slice(0, 200) });
    if (error) {
      setRadi(false);
      return setGreska(prevediGresku(error.message));
    }
    const poruka = await obavijestiKlijenta(odabrani, `Dodan je termin: ${opisTermina({ datum, vrijeme })}.`);
    setRadi(false);
    onGotovo(poruka);
  }

  return (
    <Ploca naslov="Dodatni termin" onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        {!klijentId && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-tekst-2">Klijent (uživo)</span>
            {klijenti === null ? (
              <p className="text-sm text-tekst-2">Učitavam…</p>
            ) : klijenti.length === 0 ? (
              <Poruka>Nema klijenata označenih kao „uživo”.</Poruka>
            ) : (
              <div className="flex flex-wrap gap-2">
                {klijenti.map((k) => (
                  <Cip key={k.id} aktivan={odabrani === k.id} onClick={() => setOdabrani(k.id)}>
                    {k.ime}
                  </Cip>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-tekst-2">Datum</span>
            <input type="date" min={danasZagreb()} value={datum} onChange={(e) => setDatum(e.target.value)} className={POLJE} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-tekst-2">Vrijeme</span>
            <input type="time" value={vrijeme} onChange={(e) => setVrijeme(e.target.value)} className={POLJE} />
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-tekst-2">Trajanje</span>
          <div className="grid grid-cols-4 gap-2">
            {[30, 45, 60, 90].map((m) => (
              <Cip key={m} aktivan={trajanje === m} onClick={() => setTrajanje(m)}>
                {m} min
              </Cip>
            ))}
          </div>
        </div>
        <Polje
          id="dodatni-napomena"
          oznaka="Napomena (neobavezno)"
          placeholder="npr. nadoknada za utorak"
          maxLength={200}
          value={napomena}
          onChange={(e) => setNapomena(e.target.value)}
        />
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb onClick={spremi} disabled={radi}>
          {radi ? "Spremam…" : "Dodaj termin"}
        </Gumb>
      </div>
    </Ploca>
  );
}
