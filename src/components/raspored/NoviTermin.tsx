"use client";

import { useEffect, useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Cip, Gumb, Poruka } from "@/components/ui";
import { danasZagreb, dodajDane } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { opisTermina } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { DANI, danUTjednu } from "@/lib/treninzi";
import { obavijestiKlijenta } from "./useRaspored";

const POLJE =
  "h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none focus:border-vatra";

/** Trener: novi termin iz kalendara – jedan ili više klijenata, svaki tjedan ili samo jednom. */
export function NoviTermin({
  datum: pocetniDatum,
  vrijeme: pocetnoVrijeme,
  onGotovo,
  onZatvori,
}: {
  datum: string;
  vrijeme: string;
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const [klijenti, setKlijenti] = useState<{ id: string; ime: string }[] | null>(null);
  const [odabrani, setOdabrani] = useState<string[]>([]);
  const [datum, setDatum] = useState(pocetniDatum);
  const [vrijeme, setVrijeme] = useState(pocetnoVrijeme);
  const [trajanje, setTrajanje] = useState(60);
  const [stalni, setStalni] = useState(true);
  const [upit, setUpit] = useState("");
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("profili")
      .select("id, ime, email")
      .eq("uloga", "klijent")
      .eq("nacin", "uzivo")
      .eq("aktivan", true)
      .order("ime")
      .then(({ data, error }) => {
        if (!aktivno) return;
        if (error) setGreska(prevediGresku(error.message));
        setKlijenti((data ?? []).map((k) => ({ id: String(k.id), ime: String(k.ime || k.email) })));
      });
    return () => {
      aktivno = false;
    };
  }, []);

  function promijeni(id: string) {
    setOdabrani((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  }

  async function spremi() {
    if (odabrani.length === 0) return setGreska("Odaberi barem jednog klijenta.");
    if (!datum || !vrijeme) return setGreska("Odaberi datum i vrijeme.");
    if (!stalni && datum < danasZagreb()) return setGreska("Taj dan je prošao. Odaberi današnji ili kasniji datum.");
    setGreska(null);
    setRadi(true);
    const sb = supabase();
    // stalni termin ne počinje u prošlosti: prvi isti dan u tjednu od danas nadalje
    let odDatuma = datum;
    while (odDatuma < danasZagreb()) odDatuma = dodajDane(odDatuma, 7);
    const { error } = stalni
      ? await sb.from("termini_pravila").insert(
          odabrani.map((k) => ({
            klijent_id: k,
            dan_u_tjednu: danUTjednu(datum),
            vrijeme,
            trajanje_min: trajanje,
            od_datuma: odDatuma,
          })),
        )
      : await sb
          .from("termini_dodatni")
          .insert(odabrani.map((k) => ({ klijent_id: k, datum, vrijeme, trajanje_min: trajanje })));
    if (error) {
      setRadi(false);
      return setGreska(prevediGresku(error.message));
    }
    const promjena = stalni
      ? `Novi stalni termin (svaki tjedan): ${DANI[danUTjednu(datum) - 1]} u ${vrijeme}.`
      : `Dodan je termin: ${opisTermina({ datum, vrijeme })}.`;
    await Promise.all(odabrani.map((k) => obavijestiKlijenta(k, promjena)));
    setRadi(false);
    const imena = odabrani.map((id) => klijenti?.find((k) => k.id === id)?.ime.split(" ")[0] ?? "klijent").join(", ");
    const kada = stalni ? `svaki tjedan, ${DANI[danUTjednu(datum) - 1].toLowerCase()} u ${vrijeme}` : opisTermina({ datum, vrijeme });
    onGotovo(`Dodano – ${imena}: ${kada}.`);
  }

  const u = upit.trim().toLowerCase();
  const prikazani = (klijenti ?? []).filter((k) => !u || k.ime.toLowerCase().includes(u) || odabrani.includes(k.id));

  return (
    <Ploca naslov="Novi termin" onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-rub bg-povrsina-2 p-1" role="group" aria-label="Ponavljanje">
          {(
            [
              [true, "Svaki tjedan"],
              [false, "Samo jednom"],
            ] as const
          ).map(([k, o]) => (
            <button
              key={o}
              type="button"
              onClick={() => setStalni(k)}
              aria-pressed={stalni === k}
              className={`h-10 rounded-xl text-sm font-semibold transition ${stalni === k ? "bg-vatra text-white" : "text-tekst-2"}`}
            >
              {o}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-tekst-2">{stalni ? "Od datuma" : "Datum"}</span>
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={POLJE} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-tekst-2">Vrijeme</span>
            <input type="time" value={vrijeme} onChange={(e) => setVrijeme(e.target.value)} className={POLJE} />
          </label>
        </div>
        {stalni && datum && (
          <p className="-mt-2 text-sm text-tekst-2">
            Svaki {DANI[danUTjednu(datum) - 1].toLowerCase()} u {vrijeme || "…"}
          </p>
        )}

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

        <div className="flex flex-col gap-2">
          <span className="text-sm text-tekst-2">
            Klijenti {odabrani.length > 0 ? `(${odabrani.length})` : "– može ih biti više"}
          </span>
          {klijenti && klijenti.length > 12 && (
            <input
              type="search"
              aria-label="Traži klijenta"
              placeholder="Traži klijenta…"
              value={upit}
              onChange={(e) => setUpit(e.target.value)}
              className={POLJE}
            />
          )}
          {klijenti === null ? (
            <p className="text-sm text-tekst-2">Učitavam…</p>
          ) : klijenti.length === 0 ? (
            <Poruka>Nema klijenata označenih kao „uživo”.</Poruka>
          ) : (
            <div className="flex flex-wrap gap-2">
              {prikazani.map((k) => (
                <Cip key={k.id} aktivan={odabrani.includes(k.id)} onClick={() => promijeni(k.id)}>
                  {odabrani.includes(k.id) ? "✓ " : ""}
                  {k.ime}
                </Cip>
              ))}
            </div>
          )}
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb onClick={spremi} disabled={radi || odabrani.length === 0}>
          {radi
            ? "Spremam…"
            : odabrani.length > 1
              ? `Dodaj termin (${odabrani.length} ${odabrani.length < 5 ? "klijenta" : "klijenata"})`
              : "Dodaj termin"}
        </Gumb>
      </div>
    </Ploca>
  );
}
