"use client";

import { useEffect, useState } from "react";
import { NoviTermin } from "@/components/raspored/NoviTermin";
import { TerminRadnje } from "@/components/raspored/TerminRadnje";
import { TjednaMreza } from "@/components/raspored/TjednaMreza";
import { TreningTermina } from "@/components/raspored/TreningTermina";
import { useRaspored } from "@/components/raspored/useRaspored";
import { useDanas } from "@/components/useDanas";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Cip, Gumb, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { danMjesec, dodajDane, ponedjeljak } from "@/lib/datum";
import { kljucTreninga } from "@/lib/kalendar";
import { prevediGresku } from "@/lib/greske";
import type { Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { MISICNE_SKUPINE } from "@/lib/treninzi";

type Oznake = Record<string, { skupine: string[]; zavrsen: boolean }>;

/** Skupine i stanje treninga iz kalendara za tjedan (za oznake na terminima). */
function useOznake(od: string, doDana: string, verzija: number) {
  const [stanje, setStanje] = useState<{ kljuc: string; oznake: Oznake } | null>(null);
  const kljuc = `${od}|${doDana}|${verzija}`;
  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("treninzi")
      .select("klijent_id, datum, skupine, zavrsen")
      .eq("iz_kalendara", true)
      .gte("datum", od)
      .lte("datum", doDana)
      .then(({ data }) => {
        if (!aktivno) return;
        const oznake: Oznake = {};
        for (const r of data ?? []) {
          oznake[kljucTreninga(String(r.klijent_id), String(r.datum))] = {
            skupine: Array.isArray(r.skupine) ? r.skupine.map(String) : [],
            zavrsen: Boolean(r.zavrsen),
          };
        }
        setStanje({ kljuc, oznake });
      });
    return () => {
      aktivno = false;
    };
  }, [od, doDana, kljuc]);
  return stanje?.oznake ?? {};
}

function TjedniRaspored() {
  const danas = useDanas();
  const [pon, setPon] = useState(() => ponedjeljak(danas));
  const ned = dodajDane(pon, 6);
  const { raspored, osvjezi } = useRaspored(null, pon, ned);
  const [verzijaOznaka, setVerzijaOznaka] = useState(0);
  const oznake = useOznake(pon, ned, verzijaOznaka);
  const [trening, setTrening] = useState<Termin | null>(null);
  const [radnje, setRadnje] = useState<Termin | null>(null);
  const [novi, setNovi] = useState<{ datum: string; vrijeme: string } | null>(null);
  const [obavijest, setObavijest] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [klijentFiltar, setKlijentFiltar] = useState<string>("");
  const [imeFiltra, setImeFiltra] = useState<string>("");
  const [skupineFiltar, setSkupineFiltar] = useState<string[]>([]);
  const [kopira, setKopira] = useState(false);

  function gotovo(poruka: string) {
    setRadnje(null);
    setTrening(null);
    setNovi(null);
    setObavijest(poruka);
    osvjezi();
    setVerzijaOznaka((v) => v + 1);
  }

  const aktivniTermini = raspored?.termini.filter((t) => !t.otkazan) ?? [];
  const brojKlijenata = new Set(aktivniTermini.map((t) => t.klijentId)).size;
  const ovajTjedan = pon === ponedjeljak(danas);

  // filter: klijent i/ili mišićne skupine (termin je istaknut ako trening ima barem jednu odabranu skupinu)
  const skupineTermina = (t: Termin) => oznake[kljucTreninga(t.klijentId, t.datum)]?.skupine ?? [];
  const odgovaraKlijentu = (t: Termin) => !klijentFiltar || t.klijentId === klijentFiltar;
  const istaknut = (t: Termin) =>
    odgovaraKlijentu(t) && (skupineFiltar.length === 0 || skupineTermina(t).some((s) => skupineFiltar.includes(s)));
  const imaFiltar = Boolean(klijentFiltar) || skupineFiltar.length > 0;
  const klijentiTjedna = raspored
    ? [...new Set(raspored.termini.map((t) => t.klijentId))]
        .map((id) => ({ id, ime: raspored.imena[id] ?? "Klijent" }))
        .sort((a, b) => a.ime.localeCompare(b.ime, "hr"))
    : [];
  // odabrani klijent ostaje u popisu i u tjednu u kojem nema termina
  if (klijentFiltar && !klijentiTjedna.some((k) => k.id === klijentFiltar)) {
    klijentiTjedna.unshift({ id: klijentFiltar, ime: imeFiltra || "Odabrani klijent" });
  }
  const brojPoSkupini = skupineFiltar.map((s) => ({
    s,
    n: aktivniTermini.filter((t) => odgovaraKlijentu(t) && skupineTermina(t).includes(s)).length,
  }));

  async function kopirajProsliTjedan() {
    // jedan plan po klijentu i danu (dva termina istog dana dijele plan)
    const ciljevi = [
      ...new Map(
        aktivniTermini
          .filter((t) => odgovaraKlijentu(t) && !oznake[kljucTreninga(t.klijentId, t.datum)]?.skupine.length)
          .map((t) => [kljucTreninga(t.klijentId, t.datum), t] as const),
      ).values(),
    ];
    if (ciljevi.length === 0) return setObavijest("Svi termini ovog tjedna već imaju plan.");
    if (
      !window.confirm(
        `Kopirati planove s prošlog tjedna u ${ciljevi.length} ${ciljevi.length === 1 ? "termin" : "termina"} bez plana${
          klijentFiltar ? ` (${raspored?.imena[klijentFiltar] ?? "klijent"})` : ""
        }? Termini koji već imaju plan se ne diraju.`,
      )
    ) {
      return;
    }
    setGreska(null);
    setKopira(true);
    const rez = await Promise.all(
      ciljevi.map((t) =>
        supabase().rpc("kopiraj_trening", {
          p_klijent: t.klijentId,
          p_iz: dodajDane(t.datum, -7),
          p_u: t.datum,
          p_zamijeni: false,
        }),
      ),
    );
    setKopira(false);
    const g = rez.find((r) => r.error);
    if (g?.error) setGreska(prevediGresku(g.error.message));
    const kopirano = rez.filter((r) => Number(r.data) > 0).length;
    setObavijest(
      kopirano
        ? `Kopirano ${kopirano} ${kopirano === 1 ? "trening" : "treninga"} s prošlog tjedna. Promijeni samo što treba.`
        : "Prošli tjedan nema planova za ove termine.",
    );
    setVerzijaOznaka((v) => v + 1);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl font-bold">Raspored</h1>
        <Gumb malen onClick={() => setNovi({ datum: pon > danas ? pon : danas, vrijeme: "18:00" })}>
          + Termin
        </Gumb>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Prethodni tjedan"
          onClick={() => setPon(dodajDane(pon, -7))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95"
        >
          ‹
        </button>
        <button type="button" onClick={() => setPon(ponedjeljak(danas))} className="flex flex-col items-center">
          <span className="text-lg font-bold">{ovajTjedan ? "Ovaj tjedan" : "Tjedan"}</span>
          <span className="text-sm text-tekst-2">
            {danMjesec(pon)} – {danMjesec(ned)}
            {!ovajTjedan && " · natrag na danas"}
          </span>
        </button>
        <button
          type="button"
          aria-label="Sljedeći tjedan"
          onClick={() => setPon(dodajDane(pon, 7))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95"
        >
          ›
        </button>
      </div>

      {/* filter: klijent + mišićne skupine */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <select
            aria-label="Klijent"
            value={klijentFiltar}
            onChange={(e) => {
              setKlijentFiltar(e.target.value);
              setImeFiltra(raspored?.imena[e.target.value] ?? "");
            }}
            className="h-11 min-w-0 flex-1 rounded-2xl border border-rub bg-povrsina px-3 text-base text-tekst outline-none focus:border-vatra"
          >
            <option value="">Svi klijenti</option>
            {klijentiTjedna.map((k) => (
              <option key={k.id} value={k.id}>
                {k.ime}
              </option>
            ))}
          </select>
          {imaFiltar && (
            <button
              type="button"
              onClick={() => {
                setKlijentFiltar("");
                setSkupineFiltar([]);
              }}
              className="shrink-0 px-2 text-sm font-semibold text-vatra"
            >
              Prikaži sve
            </button>
          )}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {MISICNE_SKUPINE.map((s) => (
            <Cip
              key={s}
              aktivan={skupineFiltar.includes(s)}
              onClick={() => setSkupineFiltar((f) => (f.includes(s) ? f.filter((x) => x !== s) : [...f, s]))}
            >
              {s}
            </Cip>
          ))}
        </div>
        {brojPoSkupini.length > 0 && (
          <p className="text-sm font-semibold">
            {brojPoSkupini.map(({ s, n }) => `${s} ${n}×`).join(" · ")}
            <span className="font-normal text-tekst-2"> ovaj tjedan{klijentFiltar ? "" : " (svi klijenti)"}</span>
          </p>
        )}
      </div>

      {obavijest && <Poruka tip="uspjeh">{obavijest}</Poruka>}
      {greska && <Poruka tip="greska">{greska}</Poruka>}

      {!raspored ? (
        <Ucitavanje />
      ) : (
        <>
          {raspored.greska && <Poruka tip="greska">{raspored.greska}</Poruka>}
          <p className="-mb-2 text-sm text-tekst-2">
            {aktivniTermini.length} {aktivniTermini.length === 1 ? "termin" : "termina"} · {brojKlijenata}{" "}
            {brojKlijenata === 1 ? "klijent" : "klijenata"} · dodirni termin za trening, prazno polje za novi termin
          </p>
          <TjednaMreza
            pon={pon}
            danas={danas}
            termini={raspored.termini}
            imena={raspored.imena}
            oznake={oznake}
            istaknut={imaFiltar ? istaknut : undefined}
            onTermin={setTrening}
            onPrazno={(datum, vrijeme) => setNovi({ datum, vrijeme })}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tekst-2">
            <Legenda boja="border-vatra/60 bg-vatra/30">svaki tjedan</Legenda>
            <Legenda boja="border-sky-400/60 bg-sky-500/25">jednom</Legenda>
            <Legenda boja="border-amber-400/60 bg-amber-400/25">pomaknut</Legenda>
            <Legenda boja="border-zinc-600 bg-zinc-700/40">otkazan</Legenda>
            <span>✓ odrađen</span>
          </div>
          {aktivniTermini.length > 0 && (
            <Gumb varijanta="sporedni" onClick={kopirajProsliTjedan} disabled={kopira}>
              {kopira ? "Kopiram…" : "Kopiraj planove s prošlog tjedna"}
            </Gumb>
          )}
        </>
      )}

      {trening && raspored && (
        <TreningTermina
          key={trening.kljuc}
          termin={trening}
          ime={raspored.imena[trening.klijentId] ?? "Klijent"}
          onPromjena={() => setVerzijaOznaka((v) => v + 1)}
          onTermin={() => {
            setRadnje(trening);
            setTrening(null);
          }}
          onZatvori={() => setTrening(null)}
        />
      )}
      {radnje && raspored && (
        <TerminRadnje
          termin={radnje}
          ime={raspored.imena[radnje.klijentId] ?? "Klijent"}
          onGotovo={gotovo}
          onZatvori={() => setRadnje(null)}
        />
      )}
      {novi && (
        <NoviTermin datum={novi.datum} vrijeme={novi.vrijeme} onGotovo={gotovo} onZatvori={() => setNovi(null)} />
      )}
    </>
  );
}

function Legenda({ boja, children }: { boja: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded border ${boja}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export default function TrenerRasporedStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Zaglavlje />
        <TjedniRaspored />
      </Stranica>
    </Zasticeno>
  );
}
