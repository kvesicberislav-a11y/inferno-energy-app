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
const POLJE_MALO =
  "h-11 min-w-0 rounded-xl border border-rub bg-povrsina-2 px-2 text-base text-tekst outline-none focus:border-vatra";

export type MjestoTermina = { datum: string; vrijeme: string };

const brojTermina = (n: number) => (n === 1 ? "termin" : "termina");

/**
 * Trener: novi termin iz kalendara – jedan ili više klijenata, jedan ili više dana
 * (Ctrl + klik u kalendaru ili „+ Još jedan dan”), svaki tjedan ili samo jednom.
 */
export function NoviTermin({
  termini: pocetni,
  onGotovo,
  onZatvori,
}: {
  termini: MjestoTermina[];
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const [klijenti, setKlijenti] = useState<{ id: string; ime: string }[] | null>(null);
  const [odabrani, setOdabrani] = useState<string[]>([]);
  const [redovi, setRedovi] = useState<MjestoTermina[]>(() =>
    [...pocetni].sort((a, b) => `${a.datum} ${a.vrijeme}`.localeCompare(`${b.datum} ${b.vrijeme}`)),
  );
  const [trajanje, setTrajanje] = useState(60);
  const [stalni, setStalni] = useState(false);
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

  function promijeniRed(i: number, promjena: Partial<MjestoTermina>) {
    setRedovi((r) => r.map((x, j) => (j === i ? { ...x, ...promjena } : x)));
  }

  function josJedanDan() {
    setRedovi((r) => {
      const zadnji = r[r.length - 1] ?? { datum: danasZagreb(), vrijeme: "18:00" };
      return [...r, { datum: zadnji.datum ? dodajDane(zadnji.datum, 1) : danasZagreb(), vrijeme: zadnji.vrijeme || "18:00" }];
    });
  }

  // isti dan i vrijeme upisan dvaput računa se jednom (stalni: isti dan u tjednu i vrijeme)
  const kljucReda = (r: MjestoTermina) => (stalni ? `${danUTjednu(r.datum)}|${r.vrijeme}` : `${r.datum}|${r.vrijeme}`);
  const jedinstveni = redovi.filter(
    (r, i) => r.datum && r.vrijeme && redovi.findIndex((x) => x.datum && x.vrijeme && kljucReda(x) === kljucReda(r)) === i,
  );
  const opisRedova = (rr: MjestoTermina[]) =>
    rr
      .map((r) => (stalni ? `${DANI[danUTjednu(r.datum) - 1].toLowerCase()} u ${r.vrijeme}` : opisTermina(r)))
      .join(", ");

  async function spremi() {
    if (odabrani.length === 0) return setGreska("Odaberi barem jednog klijenta.");
    if (redovi.length === 0 || redovi.some((r) => !r.datum || !r.vrijeme)) return setGreska("Odaberi datum i vrijeme.");
    if (!stalni && redovi.some((r) => r.datum < danasZagreb())) {
      return setGreska("Neki dan je prošao. Odaberi današnji ili kasniji datum.");
    }
    setGreska(null);
    setRadi(true);
    const sb = supabase();
    const { error } = stalni
      ? await sb.from("termini_pravila").insert(
          jedinstveni.flatMap((r) => {
            // stalni termin ne počinje u prošlosti: prvi isti dan u tjednu od danas nadalje
            let odDatuma = r.datum;
            while (odDatuma < danasZagreb()) odDatuma = dodajDane(odDatuma, 7);
            return odabrani.map((k) => ({
              klijent_id: k,
              dan_u_tjednu: danUTjednu(r.datum),
              vrijeme: r.vrijeme,
              trajanje_min: trajanje,
              od_datuma: odDatuma,
            }));
          }),
        )
      : await sb.from("termini_dodatni").insert(
          jedinstveni.flatMap((r) =>
            odabrani.map((k) => ({ klijent_id: k, datum: r.datum, vrijeme: r.vrijeme, trajanje_min: trajanje })),
          ),
        );
    if (error) {
      setRadi(false);
      return setGreska(prevediGresku(error.message));
    }
    const kada = opisRedova(jedinstveni);
    const promjena = stalni
      ? `Novi stalni ${jedinstveni.length === 1 ? "termin" : "termini"} (svaki tjedan): ${kada}.`
      : jedinstveni.length === 1
        ? `Dodan je termin: ${kada}.`
        : `Dodani su termini: ${kada}.`;
    await Promise.all(odabrani.map((k) => obavijestiKlijenta(k, promjena)));
    setRadi(false);
    const imena = odabrani.map((id) => klijenti?.find((k) => k.id === id)?.ime.split(" ")[0] ?? "klijent").join(", ");
    onGotovo(`Dodano – ${imena}: ${stalni ? `svaki tjedan, ${kada}` : kada}.`);
  }

  const u = upit.trim().toLowerCase();
  const prikazani = (klijenti ?? []).filter((k) => !u || k.ime.toLowerCase().includes(u) || odabrani.includes(k.id));
  const jedan = redovi.length === 1;
  const ukupno = jedinstveni.length;

  return (
    <Ploca naslov={jedan ? "Novi termin" : `Novi termini (${ukupno})`} onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-rub bg-povrsina-2 p-1" role="group" aria-label="Ponavljanje">
          {(
            [
              [false, "Samo jednom"],
              [true, "Svaki tjedan"],
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

        {jedan ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-tekst-2">{stalni ? "Od datuma" : "Datum"}</span>
              <input
                type="date"
                value={redovi[0].datum}
                onChange={(e) => promijeniRed(0, { datum: e.target.value })}
                className={POLJE}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-tekst-2">Vrijeme</span>
              <input
                type="time"
                value={redovi[0].vrijeme}
                onChange={(e) => promijeniRed(0, { vrijeme: e.target.value })}
                className={POLJE}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-tekst-2">
              {stalni ? "Dani (od datuma)" : "Termini"} – {ukupno} {brojTermina(ukupno)}
            </span>
            {redovi.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_2.75rem] items-center gap-2">
                <input
                  type="date"
                  aria-label={`Datum ${i + 1}`}
                  value={r.datum}
                  onChange={(e) => promijeniRed(i, { datum: e.target.value })}
                  className={POLJE_MALO}
                />
                <input
                  type="time"
                  aria-label={`Vrijeme ${i + 1}`}
                  value={r.vrijeme}
                  onChange={(e) => promijeniRed(i, { vrijeme: e.target.value })}
                  className={POLJE_MALO}
                />
                <button
                  type="button"
                  aria-label={`Makni termin ${i + 1}`}
                  onClick={() => setRedovi((rr) => rr.filter((_, j) => j !== i))}
                  className="h-11 rounded-xl text-lg text-tekst-2 active:bg-povrsina-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {stalni && redovi.every((r) => r.datum) && (
          <p className="-mt-2 text-sm text-tekst-2">Svaki {opisRedova(jedinstveni) || "…"}</p>
        )}
        <button type="button" onClick={josJedanDan} className="-mt-1 self-start py-1 text-sm font-semibold text-vatra">
          + Još jedan dan
        </button>

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
        <Gumb onClick={spremi} disabled={radi || odabrani.length === 0 || ukupno === 0}>
          {radi
            ? "Spremam…"
            : `${ukupno > 1 ? `Dodaj ${ukupno} termina` : "Dodaj termin"}${
                odabrani.length > 1 ? ` (${odabrani.length} ${odabrani.length < 5 ? "klijenta" : "klijenata"})` : ""
              }`}
        </Gumb>
      </div>
    </Ploca>
  );
}
