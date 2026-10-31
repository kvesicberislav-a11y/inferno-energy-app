"use client";

import { useEffect, useState } from "react";
import { LinijskiGraf, TablicaPodataka, type Tocka } from "@/components/grafovi/Grafovi";
import { Kartica, Poruka } from "@/components/ui";
import { danMjesec } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { formatG } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { usePraceneVjezbe } from "./PraceneVjezbe";

type Dan = { datum: string; kg: number; ponavljanja: number; serija: number };
type Vjezba = { id: string; naziv: string; skupina: string; dani: Dan[] };
type Stanje = { kljuc: string; vjezbe: Vjezba[]; greska: string | null };

/** Napredak po vježbi: najteža serija na svakom treningu kroz odabrano razdoblje. */
export function NapredakVjezbi({ klijentId, od, danas }: { klijentId: string; od: string; danas: string }) {
  const kljuc = `${klijentId}|${od}|${danas}`;
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [odabrana, setOdabrana] = useState<string | null>(null);
  // trener je odabrao praćene vježbe → prikazuju se samo one (ostale na „Prikaži sve vježbe”)
  const pracene = usePraceneVjezbe(klijentId);
  const [sve, setSve] = useState(false);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .rpc("napredak_vjezbi", { p_klijent: klijentId, p_od: od, p_do: danas })
      .then(({ data, error }) => {
        if (!aktivno) return;
        const po = new Map<string, Vjezba>();
        for (const r of (data as Record<string, unknown>[] | null) ?? []) {
          const id = String(r.vjezba_id);
          const v = po.get(id) ?? { id, naziv: String(r.naziv), skupina: String(r.misicna_skupina ?? ""), dani: [] };
          v.dani.push({
            datum: String(r.datum),
            kg: Number(r.kg),
            ponavljanja: Number(r.ponavljanja),
            serija: Number(r.serija),
          });
          po.set(id, v);
        }
        const vjezbe = [...po.values()]
          .map((v) => ({ ...v, dani: v.dani.sort((a, b) => a.datum.localeCompare(b.datum)) }))
          // najčešće prve
          .sort((a, b) => b.dani.length - a.dani.length || a.naziv.localeCompare(b.naziv, "hr"));
        setStanje({ kljuc, vjezbe, greska: error ? prevediGresku(error.message) : null });
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId, od, danas, kljuc]);

  const sveVjezbe = stanje?.kljuc === kljuc ? stanje.vjezbe : (stanje?.vjezbe ?? []);
  const imaOdabir = pracene.ids.size > 0 && sveVjezbe.some((x) => pracene.ids.has(x.id));
  const vjezbe = imaOdabir && !sve ? sveVjezbe.filter((x) => pracene.ids.has(x.id)) : sveVjezbe;
  const v = vjezbe.find((x) => x.id === odabrana) ?? vjezbe[0] ?? null;
  // vježbe bez utega (npr. sklekovi) prate se po ponavljanjima
  const poKg = v ? v.dani.some((d) => d.kg > 0) : true;
  const tocke: Tocka[] = (v?.dani ?? []).map((d) => ({
    kljuc: d.datum,
    oznaka: danMjesec(d.datum),
    vrijednost: poKg ? (d.kg > 0 ? d.kg : null) : d.ponavljanja,
  }));
  const sVrijednoscu = (v?.dani ?? []).filter((d) => (poKg ? d.kg > 0 : true));
  const prvi = sVrijednoscu[0];
  const zadnji = sVrijednoscu[sVrijednoscu.length - 1];
  const najbolji = sVrijednoscu.reduce<Dan | null>(
    (m, d) => (!m || d.kg > m.kg || (d.kg === m.kg && d.ponavljanja > m.ponavljanja) ? d : m),
    null,
  );
  const opis = (d: Dan) => (poKg ? `${formatG(d.kg)} kg × ${d.ponavljanja}` : `${d.ponavljanja} pon.`);

  return (
    <Kartica className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-semibold">Napredak po vježbi</h3>
        <p className="text-sm text-tekst-2">najteža serija na svakom treningu</p>
      </div>
      {stanje?.greska && <Poruka tip="greska">{stanje.greska}</Poruka>}
      {stanje === null ? (
        <p className="text-sm text-tekst-2">Učitavam…</p>
      ) : vjezbe.length === 0 ? (
        <Poruka>Još nema odrađenih serija u ovom razdoblju.</Poruka>
      ) : (
        <>
          <select
            aria-label="Vježba"
            value={v?.id ?? ""}
            onChange={(e) => setOdabrana(e.target.value)}
            className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-3 text-base text-tekst outline-none focus:border-vatra"
          >
            {vjezbe.map((x) => (
              <option key={x.id} value={x.id}>
                {x.naziv} ({x.dani.length}×)
              </option>
            ))}
          </select>
          {imaOdabir && (
            <label className="flex items-center gap-2 text-sm text-tekst-2">
              <input type="checkbox" checked={sve} onChange={(e) => setSve(e.target.checked)} className="h-5 w-5 accent-vatra" />
              Prikaži sve vježbe ({sveVjezbe.length}) – inače samo odabrane ({vjezbe.length})
            </label>
          )}
          {v && prvi && zadnji && najbolji && (
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Podatak oznaka="Prvi put" vrijednost={opis(prvi)} ispod={danMjesec(prvi.datum)} />
              <Podatak oznaka="Zadnje" vrijednost={opis(zadnji)} ispod={danMjesec(zadnji.datum)} />
              <Podatak oznaka="Najbolje" vrijednost={opis(najbolji)} ispod={danMjesec(najbolji.datum)} istaknuto />
            </div>
          )}
          {v && poKg && prvi && zadnji && zadnji.kg !== prvi.kg && (
            <p className={`text-sm font-semibold ${zadnji.kg > prvi.kg ? "text-emerald-300" : "text-amber-200"}`}>
              {zadnji.kg > prvi.kg ? "+" : ""}
              {formatG(zadnji.kg - prvi.kg)} kg od prvog treninga u razdoblju
            </p>
          )}
          {tocke.filter((t) => t.vrijednost !== null).length >= 2 ? (
            <LinijskiGraf
              tocke={tocke}
              format={(n) => formatG(n)}
              jedinica={poKg ? "kg" : "pon."}
              opis={`${v?.naziv ?? "Vježba"} kroz vrijeme`}
            />
          ) : (
            <Poruka>Za graf trebaju barem 2 treninga s ovom vježbom u odabranom razdoblju.</Poruka>
          )}
          {v && (
            <TablicaPodataka
              zaglavlje={["Datum", "Najteža serija", "Serija"]}
              redovi={[...v.dani].reverse().map((d) => [danMjesec(d.datum), opis(d), String(d.serija)])}
            />
          )}
        </>
      )}
    </Kartica>
  );
}

function Podatak({ oznaka, vrijednost, ispod, istaknuto }: { oznaka: string; vrijednost: string; ispod: string; istaknuto?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl px-2.5 py-2 ${istaknuto ? "bg-vatra/15" : "bg-povrsina-2"}`}>
      <p className="truncate text-xs text-tekst-2">{oznaka}</p>
      <p className="truncate font-semibold tabular-nums">{vrijednost}</p>
      <p className="truncate text-xs text-tekst-2 tabular-nums">{ispod}</p>
    </div>
  );
}
