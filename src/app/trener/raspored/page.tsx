"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { KopirajPlanove } from "@/components/raspored/KopirajPlanove";
import { NoviTermin } from "@/components/raspored/NoviTermin";
import { TerminRadnje } from "@/components/raspored/TerminRadnje";
import { TjednaMreza } from "@/components/raspored/TjednaMreza";
import { TreningTermina } from "@/components/raspored/TreningTermina";
import { ocistiPlanoveBezTermina, useRaspored } from "@/components/raspored/useRaspored";
import { useDanas } from "@/components/useDanas";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Cip, Gumb, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { danMjesec, dodajDane, ponedjeljak, tjedanUGodini } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { kljucTreninga } from "@/lib/kalendar";
import type { Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { MISICNE_SKUPINE } from "@/lib/treninzi";

type Oznake = Record<string, { skupine: string[]; zavrsen: boolean; nijeDosao: boolean }>;

const RACUNALO = "(min-width: 1024px)";

/** Je li prozor širok kao na računalu (isti prag kao Tailwind lg). */
function useRacunalo() {
  return useSyncExternalStore(
    (javi) => {
      const m = window.matchMedia(RACUNALO);
      m.addEventListener("change", javi);
      return () => m.removeEventListener("change", javi);
    },
    () => window.matchMedia(RACUNALO).matches,
    () => false,
  );
}

/** Visina prozora (za puni zaslon: cijeli dan stane bez pomicanja). */
function useVisinaProzora() {
  return useSyncExternalStore(
    (javi) => {
      window.addEventListener("resize", javi);
      return () => window.removeEventListener("resize", javi);
    },
    () => window.innerHeight,
    () => 0,
  );
}

/** Skupine i stanje treninga iz kalendara za tjedan (za oznake na terminima). */
function useOznake(od: string, doDana: string, verzija: number) {
  const [stanje, setStanje] = useState<{ kljuc: string; oznake: Oznake } | null>(null);
  const kljuc = `${od}|${doDana}|${verzija}`;
  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("treninzi")
      .select("klijent_id, datum, skupine, zavrsen, nije_dosao")
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
            nijeDosao: Boolean(r.nije_dosao),
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
  const [klijentFiltar, setKlijentFiltar] = useState<string>("");
  const [imeFiltra, setImeFiltra] = useState<string>("");
  const [skupineFiltar, setSkupineFiltar] = useState<string[]>([]);
  const [kopiranje, setKopiranje] = useState(false);
  const [brise, setBrise] = useState(false);
  const [greskaBrisanja, setGreskaBrisanja] = useState<string | null>(null);
  const racunalo = useRacunalo();
  const visinaProzora = useVisinaProzora();
  // puni zaslon: samo raspored (bez zaglavlja i izbornika), preko cijelog ekrana
  const [puni, setPuni] = useState(false);

  useEffect(() => {
    // Esc ili izlaz iz punog zaslona preglednika vraća običan prikaz
    const naPromjenu = () => {
      if (!document.fullscreenElement) setPuni(false);
    };
    document.addEventListener("fullscreenchange", naPromjenu);
    return () => document.removeEventListener("fullscreenchange", naPromjenu);
  }, []);

  async function ukljuciPuniZaslon() {
    setPuni(true);
    await document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  async function iskljuciPuniZaslon() {
    setPuni(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }

  /** Obriši sve termine prikazanog tjedna (ili samo odabranog klijenta). Stalni termini nestaju samo ovaj tjedan. */
  async function obrisiTjedan() {
    if (!raspored) return;
    const za = raspored.termini.filter((t) => !klijentFiltar || t.klijentId === klijentFiltar);
    if (za.length === 0) return;
    const tko = klijentFiltar ? ` za ${raspored.imena[klijentFiltar] ?? "klijenta"}` : "";
    if (
      !window.confirm(
        `Obrisati sve termine u tjednu ${danMjesec(pon)} – ${danMjesec(ned)}${tko} (${za.length})?

` +
          "Stalni termini nestaju samo ovaj tjedan, sljedeći tjedni ostaju. " +
          "Planovi treninga bez upisanih serija se brišu, upisane serije ostaju.",
      )
    ) {
      return;
    }
    setGreskaBrisanja(null);
    setBrise(true);
    const sb = supabase();
    const iznimke = za
      .filter((t) => t.pravilo)
      .map((t) => ({
        pravilo_id: t.pravilo!.id,
        datum: t.izvorniDatum ?? t.datum,
        otkazan: true,
        obrisan: true,
        novi_datum: null,
        novo_vrijeme: null,
      }));
    const dodatni = za.filter((t) => t.dodatni).map((t) => t.dodatni!.id);
    const rez = await Promise.all([
      iznimke.length
        ? sb.from("termini_iznimke").upsert(iznimke, { onConflict: "pravilo_id,datum" })
        : Promise.resolve({ error: null }),
      dodatni.length ? sb.from("termini_dodatni").delete().in("id", dodatni) : Promise.resolve({ error: null }),
    ]);
    const g = rez.find((r) => r.error)?.error;
    if (!g) {
      await Promise.all([...new Set(za.map((t) => t.klijentId))].map((k) => ocistiPlanoveBezTermina(k, pon).catch(() => undefined)));
    }
    setBrise(false);
    if (g) return setGreskaBrisanja(prevediGresku(g.message));
    gotovo(`Obrisano ${za.length} ${za.length === 1 ? "termin" : "termina"} u tjednu ${danMjesec(pon)} – ${danMjesec(ned)}.`);
  }

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
  const { tjedan, godina } = tjedanUGodini(pon);

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

  return (
    <>
      {!puni && (
        <div className="w-full lg:mx-auto lg:max-w-md">
          <Zaglavlje />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl font-bold">Raspored</h1>
        <div className="flex items-center gap-2">
          {puni ? (
            <Gumb varijanta="sporedni" malen onClick={iskljuciPuniZaslon}>
              ✕ Izađi iz punog zaslona
            </Gumb>
          ) : (
            <span className="hidden lg:block">
              <Gumb varijanta="sporedni" malen onClick={ukljuciPuniZaslon}>
                ⛶ Puni zaslon
              </Gumb>
            </span>
          )}
          <Gumb malen onClick={() => setNovi({ datum: pon > danas ? pon : danas, vrijeme: "18:00" })}>
            + Termin
          </Gumb>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-2 lg:mx-auto lg:max-w-xl">
        <button
          type="button"
          aria-label="Prethodni tjedan"
          onClick={() => setPon(dodajDane(pon, -7))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rub bg-povrsina text-2xl text-tekst-2 active:scale-95"
        >
          ‹
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="text-lg font-bold">
            {tjedan}. tjedan {godina}
          </span>
          <span className="text-sm text-tekst-2">
            {danMjesec(pon)} – {danMjesec(ned)}
            {ovajTjedan && " · ovaj tjedan"}
          </span>
        </div>
        <button
          type="button"
          aria-label="Natrag na ovaj tjedan"
          title="Natrag na ovaj tjedan"
          onClick={() => setPon(ponedjeljak(danas))}
          className={`flex h-12 w-12 items-center justify-center rounded-2xl border active:scale-95 ${
            ovajTjedan ? "border-rub bg-povrsina text-tekst-2 opacity-50" : "border-vatra bg-vatra/15 text-vatra"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10" strokeLinejoin="round" />
          </svg>
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
      <div className="flex w-full flex-col gap-2 lg:mx-auto lg:max-w-3xl">
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
            boje={raspored.boje}
            istaknut={imaFiltar ? istaknut : undefined}
            siroko={racunalo}
            // puni zaslon: cijeli dan stane na ekran (ostatak visine zauzimaju gumbi i filter iznad)
            visinaMreze={puni && visinaProzora ? Math.max(480, visinaProzora - 330) : undefined}
            onTermin={setTrening}
            onPrazno={(datum, vrijeme) => setNovi({ datum, vrijeme })}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tekst-2">
            <span>Svaki klijent ima svoju boju.</span>
            <Legenda boja="border-2 border-solid border-tekst-2">svaki tjedan</Legenda>
            <Legenda boja="border-2 border-dashed border-tekst-2">samo jednom</Legenda>
            <span>↻ pomaknut</span>
            <Legenda boja="border border-zinc-600 bg-zinc-700/60">otkazan</Legenda>
            <span>✓ odrađen</span>
            <span>✗ nije došao</span>
          </div>
          {aktivniTermini.length > 0 && (
            <Gumb varijanta="sporedni" onClick={() => setKopiranje(true)}>
              Kopiraj planove s ranijeg tjedna
            </Gumb>
          )}
          {greskaBrisanja && <Poruka tip="greska">{greskaBrisanja}</Poruka>}
          {raspored.termini.some((t) => !klijentFiltar || t.klijentId === klijentFiltar) && (
            <Gumb varijanta="opasni" onClick={obrisiTjedan} disabled={brise}>
              {brise
                ? "Brišem…"
                : klijentFiltar
                  ? `Obriši tjedan – samo ${(raspored.imena[klijentFiltar] ?? "klijent").split(" ")[0]}`
                  : "Obriši cijeli tjedan"}
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
      {kopiranje && raspored && (
        <KopirajPlanove
          pon={pon}
          termini={aktivniTermini}
          imena={raspored.imena}
          imaPlan={(k, d) => Boolean(oznake[kljucTreninga(k, d)]?.skupine.length)}
          pocetniKlijent={klijentFiltar}
          onGotovo={(poruka) => {
            setKopiranje(false);
            setObavijest(poruka);
            setVerzijaOznaka((v) => v + 1);
          }}
          onZatvori={() => setKopiranje(false)}
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
      <span className={`h-3 w-4 rounded ${boja}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export default function TrenerRasporedStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica siroka>
        <TjedniRaspored />
      </Stranica>
    </Zasticeno>
  );
}
