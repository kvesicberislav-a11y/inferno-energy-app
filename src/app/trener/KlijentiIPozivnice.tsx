"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { LinkZaSlanje } from "@/components/LinkZaSlanje";
import { LinkZaInstalaciju } from "./LinkZaInstalaciju";
import { Cip, Gumb, Kartica, Polje, Poruka, Ucitavanje } from "@/components/ui";
import { aktivnost, type Aktivnost } from "@/lib/aktivnost";
import { danMjesec, formatDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { formatKcal } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { format1 } from "@/lib/tijelo";
import type { Pozivnica } from "@/lib/tipovi";

function linkPozivnice(kod: string) {
  return `${window.location.origin}/pozivnica?kod=${kod}`;
}

function porukaPozivnice(ime: string, link: string) {
  return `Bok ${ime.split(" ")[0]}! Ovo je tvoj link za registraciju u INFERNO ENERGY aplikaciju:\n${link}`;
}

export type PregledKlijenta = {
  id: string;
  ime: string;
  email: string;
  kreirano: string;
  nacin: "uzivo" | "online";
  zadnjaAktivnost: string | null;
  zadnjaTezina: number | null;
  datumTezine: string | null;
  plan: string | null;
  kcalDanas: number | null;
  kcalCilj: number | null;
  aktivnost: Aktivnost;
};

type Podaci = {
  klijenti: PregledKlijenta[] | null;
  pozivnice: Pozivnica[] | null;
  greska: string | null;
};

async function dohvatiPodatke(): Promise<Podaci> {
  const sb = supabase();
  const [k, p] = await Promise.all([
    sb.rpc("pregled_klijenata"),
    sb
      .from("pozivnice")
      .select("*")
      .is("iskoristena_at", null)
      .gt("vrijedi_do", new Date().toISOString())
      .order("kreirano", { ascending: false }),
  ]);
  if (k.error || p.error) {
    return { klijenti: null, pozivnice: null, greska: prevediGresku((k.error ?? p.error)?.message) };
  }
  type Red = Record<string, unknown>;
  const klijenti = ((k.data as Red[] | null) ?? []).map((r) => {
    const zadnja = r.zadnja_aktivnost ? String(r.zadnja_aktivnost) : null;
    const kreirano = String(r.kreirano);
    return {
      id: String(r.id),
      ime: String(r.ime ?? ""),
      email: String(r.email ?? ""),
      kreirano,
      nacin: r.nacin === "online" ? ("online" as const) : ("uzivo" as const),
      zadnjaAktivnost: zadnja,
      zadnjaTezina: r.zadnja_tezina == null ? null : Number(r.zadnja_tezina),
      datumTezine: r.datum_tezine ? String(r.datum_tezine) : null,
      plan: r.plan ? String(r.plan) : null,
      kcalDanas: r.kcal_danas == null ? null : Number(r.kcal_danas),
      kcalCilj: r.kcal_cilj == null ? null : Number(r.kcal_cilj),
      aktivnost: aktivnost(zadnja, kreirano),
    };
  });
  // Prvo oni kojima treba pažnja (najdulje bez unosa), zatim ostali po imenu
  klijenti.sort((a, b) =>
    a.aktivnost.upozorenje !== b.aktivnost.upozorenje
      ? Number(b.aktivnost.upozorenje) - Number(a.aktivnost.upozorenje)
      : a.aktivnost.upozorenje
        ? b.aktivnost.danaBez - a.aktivnost.danaBez
        : (a.ime || a.email).localeCompare(b.ime || b.email, "hr"),
  );
  return { klijenti, pozivnice: p.data as Pozivnica[], greska: null };
}

export function KlijentiIPozivnice() {
  const [podaci, setPodaci] = useState<Podaci | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [filtar, setFiltar] = useState<"svi" | "paznja">("svi");
  const [nacin, setNacin] = useState<"svi" | "uzivo" | "online">("svi");
  const [upit, setUpit] = useState("");

  useEffect(() => {
    let aktivno = true;
    dohvatiPodatke().then((rezultat) => {
      if (aktivno) setPodaci(rezultat);
    });
    return () => {
      aktivno = false;
    };
  }, [verzija]);

  const ucitaj = useCallback(() => setVerzija((v) => v + 1), []);
  const klijenti = podaci?.klijenti ?? null;
  const pozivnice = podaci?.pozivnice ?? null;
  const greska = podaci?.greska ?? null;

  const trebaPaznju = klijenti?.filter((k) => k.aktivnost.upozorenje).length ?? 0;
  const aktivniDanas = klijenti?.filter((k) => !k.aktivnost.nikad && k.aktivnost.danaBez === 0).length ?? 0;
  const u = upit.trim().toLowerCase();
  const prikazani =
    klijenti?.filter(
      (k) =>
        (filtar === "svi" || k.aktivnost.upozorenje) &&
        (nacin === "svi" || k.nacin === nacin) &&
        (!u || `${k.ime} ${k.email}`.toLowerCase().includes(u)),
    ) ?? [];

  return (
    <>
      <h1 className="pt-2 text-3xl font-bold">Klijenti</h1>
      {greska && <Poruka tip="greska">{greska}</Poruka>}

      {klijenti && klijenti.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Plocica oznaka="Klijenata" vrijednost={klijenti.length} />
          <Plocica oznaka="Aktivni danas" vrijednost={aktivniDanas} />
          <Plocica oznaka="Treba pažnju" vrijednost={trebaPaznju} upozorenje={trebaPaznju > 0} />
        </div>
      )}

      <NovaPozivnica naPromjenu={ucitaj} />
      <LinkZaInstalaciju />

      {pozivnice === null || klijenti === null ? (
        !greska && <Ucitavanje />
      ) : (
        <>
          {pozivnice.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-tekst-2">Poslane pozivnice</h2>
              {pozivnice.map((p) => (
                <RedPozivnice key={p.id} pozivnica={p} naPromjenu={ucitaj} />
              ))}
            </section>
          )}

          <section className="flex flex-col gap-3">
            {klijenti.length === 0 ? (
              <Poruka>Još nema klijenata. Pozovi prvog gumbom iznad.</Poruka>
            ) : (
              <>
                <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
                  <Cip aktivan={nacin === "svi"} onClick={() => setNacin("svi")}>
                    Svi ({klijenti.length})
                  </Cip>
                  <Cip aktivan={nacin === "uzivo"} onClick={() => setNacin("uzivo")}>
                    Uživo ({klijenti.filter((k) => k.nacin === "uzivo").length})
                  </Cip>
                  <Cip aktivan={nacin === "online"} onClick={() => setNacin("online")}>
                    Online ({klijenti.filter((k) => k.nacin === "online").length})
                  </Cip>
                  <span className="mx-1 h-6 w-px shrink-0 bg-rub" aria-hidden="true" />
                  <Cip
                    aktivan={filtar === "paznja"}
                    onClick={() => setFiltar(filtar === "paznja" ? "svi" : "paznja")}
                  >
                    ⚠ Treba pažnju ({trebaPaznju})
                  </Cip>
                </div>
                {klijenti.length > 5 && (
                  <input
                    type="search"
                    aria-label="Pretraži klijente"
                    placeholder="Pretraži po imenu ili e-mailu…"
                    value={upit}
                    onChange={(e) => setUpit(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-rub bg-povrsina px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
                  />
                )}
                {prikazani.length === 0 ? (
                  <Poruka>{filtar === "paznja" ? "Svi klijenti su aktivni. 👍" : "Nema rezultata."}</Poruka>
                ) : (
                  prikazani.map((k) => <KarticaKlijenta key={k.id} k={k} />)
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Plocica({ oznaka, vrijednost, upozorenje }: { oznaka: string; vrijednost: number; upozorenje?: boolean }) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-3 ${
        upozorenje ? "border-amber-400/40 bg-amber-400/10" : "border-rub bg-povrsina"
      }`}
    >
      <span className="text-xs text-tekst-2">{oznaka}</span>
      <span className="text-2xl font-bold">{vrijednost}</span>
    </div>
  );
}

export function KarticaKlijenta({ k }: { k: PregledKlijenta }) {
  const a = k.aktivnost;
  const boja = a.upozorenje ? "bg-amber-400" : a.danaBez === 0 && !a.nikad ? "bg-emerald-400" : "bg-zinc-500";
  const ikona = a.upozorenje ? "!" : a.danaBez === 0 && !a.nikad ? "✓" : "";
  return (
    <Link
      href={`/trener/klijent?id=${k.id}`}
      className={`flex flex-col gap-2 rounded-3xl border bg-povrsina p-4 active:scale-[0.99] ${
        a.upozorenje ? "border-amber-400/50" : "border-rub"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="truncate text-lg font-semibold">{k.ime || k.email}</span>
            <OznakaNacina nacin={k.nacin} />
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-tekst-2">
            <span
              className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-black ${boja}`}
              aria-hidden="true"
            >
              {ikona}
            </span>
            {a.opis}
          </p>
        </div>
        <span className="text-2xl text-tekst-2" aria-hidden="true">
          ›
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Podatak
          oznaka="Danas"
          vrijednost={k.kcalDanas !== null ? formatKcal(k.kcalDanas) : "—"}
          jedinica={k.kcalDanas !== null ? "kcal" : ""}
          ispod={k.kcalCilj ? `cilj ${formatKcal(k.kcalCilj)}` : undefined}
        />
        <Podatak
          oznaka="Težina"
          vrijednost={k.zadnjaTezina !== null ? format1(k.zadnjaTezina) : "—"}
          jedinica={k.zadnjaTezina !== null ? "kg" : ""}
          ispod={k.datumTezine ? danMjesec(k.datumTezine) : undefined}
        />
        <div className="min-w-0 rounded-xl bg-povrsina-2 px-2.5 py-2">
          <p className="truncate text-xs text-tekst-2">Plan</p>
          <p className="line-clamp-2 text-sm leading-tight font-semibold break-words">
            {/* dopusti prijelom iza kose crte ("Gornji/donji") */}
            {k.plan ? k.plan.replace(/\//g, "/​") : "nema"}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function OznakaNacina({ nacin }: { nacin: "uzivo" | "online" }) {
  return (
    <span
      className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold ${
        nacin === "online" ? "bg-sky-400/15 text-sky-200" : "bg-vatra/15 text-orange-200"
      }`}
    >
      {nacin === "online" ? "Online" : "Uživo"}
    </span>
  );
}

function Podatak({
  oznaka,
  vrijednost,
  jedinica,
  ispod,
}: {
  oznaka: string;
  vrijednost: string;
  jedinica?: string;
  ispod?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-povrsina-2 px-2.5 py-2">
      <p className="truncate text-xs text-tekst-2">{oznaka}</p>
      <p className="truncate font-semibold tabular-nums">
        {vrijednost}
        {jedinica ? <span className="ml-0.5 text-xs font-normal text-tekst-2">{jedinica}</span> : null}
      </p>
      {ispod && <p className="truncate text-xs text-tekst-2 tabular-nums">{ispod}</p>}
    </div>
  );
}

function NovaPozivnica({ naPromjenu }: { naPromjenu: () => void }) {
  const [otvoreno, setOtvoreno] = useState(false);
  const [ime, setIme] = useState("");
  const [salje, setSalje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [nova, setNova] = useState<Pozivnica | null>(null);

  async function napravi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    setSalje(true);
    const { data, error } = await supabase()
      .from("pozivnice")
      .insert({ ime: ime.trim() })
      .select()
      .single();
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    setNova(data as Pozivnica);
    setIme("");
    naPromjenu();
  }

  function zatvori() {
    setOtvoreno(false);
    setNova(null);
    setGreska(null);
  }

  if (!otvoreno) {
    return <Gumb onClick={() => setOtvoreno(true)}>+ Pozovi klijenta</Gumb>;
  }

  return (
    <Kartica className="flex flex-col gap-4">
      {nova ? (
        <>
          <p className="text-lg font-semibold">Pozivnica za {nova.ime} je spremna</p>
          <p className="text-tekst-2">
            Pošalji link klijentu. Vrijedi do {formatDatum(nova.vrijedi_do)} i može se iskoristiti
            samo jednom.
          </p>
          <LinkZaSlanje
            link={linkPozivnice(nova.kod)}
            poruka={porukaPozivnice(nova.ime, linkPozivnice(nova.kod))}
          />
          <Gumb varijanta="sporedni" onClick={zatvori}>
            Gotovo
          </Gumb>
        </>
      ) : (
        <form onSubmit={napravi} className="flex flex-col gap-4">
          <p className="text-lg font-semibold">Nova pozivnica</p>
          <Polje
            id="ime-klijenta"
            oznaka="Ime i prezime klijenta"
            autoComplete="off"
            required
            maxLength={100}
            value={ime}
            onChange={(e) => setIme(e.target.value)}
          />
          {greska && <Poruka tip="greska">{greska}</Poruka>}
          <div className="grid grid-cols-2 gap-3">
            <Gumb type="button" varijanta="sporedni" onClick={zatvori}>
              Odustani
            </Gumb>
            <Gumb type="submit" disabled={salje || !ime.trim()}>
              {salje ? "…" : "Napravi"}
            </Gumb>
          </div>
        </form>
      )}
    </Kartica>
  );
}

function RedPozivnice({
  pozivnica,
  naPromjenu,
}: {
  pozivnica: Pozivnica;
  naPromjenu: () => void;
}) {
  const [prikaziLink, setPrikaziLink] = useState(false);
  const [brise, setBrise] = useState(false);
  const link = prikaziLink ? linkPozivnice(pozivnica.kod) : "";

  async function ponisti() {
    if (!window.confirm(`Poništiti pozivnicu za ${pozivnica.ime}?`)) return;
    setBrise(true);
    await supabase().from("pozivnice").delete().eq("id", pozivnica.id);
    naPromjenu();
  }

  return (
    <Kartica className="flex flex-col gap-3">
      <div>
        <p className="text-lg font-semibold">{pozivnica.ime}</p>
        <p className="text-sm text-tekst-2">
          Čeka registraciju · vrijedi do {formatDatum(pozivnica.vrijedi_do)}
        </p>
      </div>
      {prikaziLink ? (
        <LinkZaSlanje link={link} poruka={porukaPozivnice(pozivnica.ime, link)} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Gumb varijanta="sporedni" malen onClick={() => setPrikaziLink(true)}>
            Pošalji ponovno
          </Gumb>
          <Gumb varijanta="opasni" malen onClick={ponisti} disabled={brise}>
            Poništi
          </Gumb>
        </div>
      )}
    </Kartica>
  );
}
