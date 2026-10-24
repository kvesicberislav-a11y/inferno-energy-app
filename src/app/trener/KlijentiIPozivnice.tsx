"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { LinkZaSlanje } from "@/components/LinkZaSlanje";
import { Gumb, Kartica, Polje, Poruka, Ucitavanje } from "@/components/ui";
import { formatDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import type { Pozivnica, Profil } from "@/lib/tipovi";

function linkPozivnice(kod: string) {
  return `${window.location.origin}/pozivnica?kod=${kod}`;
}

function porukaPozivnice(ime: string, link: string) {
  return `Bok ${ime.split(" ")[0]}! Ovo je tvoj link za registraciju u INFERNO ENERGY aplikaciju:\n${link}`;
}

type Podaci = {
  klijenti: Profil[] | null;
  pozivnice: Pozivnica[] | null;
  greska: string | null;
};

async function dohvatiPodatke(): Promise<Podaci> {
  const sb = supabase();
  const [k, p] = await Promise.all([
    sb.from("profili").select("*").eq("uloga", "klijent").order("ime"),
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
  return { klijenti: k.data as Profil[], pozivnice: p.data as Pozivnica[], greska: null };
}

export function KlijentiIPozivnice() {
  const [podaci, setPodaci] = useState<Podaci | null>(null);
  const [verzija, setVerzija] = useState(0);

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

  return (
    <>
      <h1 className="pt-2 text-3xl font-bold">Klijenti</h1>
      {greska && <Poruka tip="greska">{greska}</Poruka>}
      <NovaPozivnica naPromjenu={ucitaj} />
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
            <h2 className="text-lg font-semibold text-tekst-2">
              Registrirani klijenti ({klijenti.length})
            </h2>
            {klijenti.length === 0 ? (
              <Poruka>Još nema klijenata. Pozovi prvog gumbom iznad.</Poruka>
            ) : (
              klijenti.map((k) => <RedKlijenta key={k.id} klijent={k} />)
            )}
          </section>
        </>
      )}
    </>
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

function RedKlijenta({ klijent }: { klijent: Profil }) {
  const [link, setLink] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  async function novaLozinka() {
    if (!window.confirm(`Napraviti link za novu lozinku za ${klijent.ime || klijent.email}?`)) {
      return;
    }
    setGreska(null);
    setRadi(true);
    try {
      const sb = supabase();
      const { data } = await sb.auth.getSession();
      const odgovor = await fetch("/api/reset-lozinke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ klijentId: klijent.id }),
      });
      const rezultat = (await odgovor.json().catch(() => ({}))) as {
        token?: string;
        greska?: string;
      };
      if (!odgovor.ok || !rezultat.token) {
        setGreska(rezultat.greska ?? "Ne mogu napraviti link. Pokušaj ponovno.");
        return;
      }
      setLink(`${window.location.origin}/nova-lozinka?token=${rezultat.token}`);
    } catch (err) {
      setGreska(prevediGresku(err instanceof Error ? err.message : null));
    } finally {
      setRadi(false);
    }
  }

  const ime = klijent.ime || klijent.email;

  return (
    <Kartica className="flex flex-col gap-3">
      <Link
        href={`/trener/klijent?id=${klijent.id}`}
        className="flex items-center justify-between gap-3 active:opacity-70"
      >
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{ime}</p>
          <p className="truncate text-sm text-tekst-2">{klijent.email}</p>
          <p className="text-sm text-tekst-2">Klijent od {formatDatum(klijent.kreirano)}</p>
        </div>
        <span className="shrink-0 text-2xl text-tekst-2" aria-hidden="true">
          ›
        </span>
      </Link>
      {!link && (
        <Gumb
          varijanta="sporedni"
          malen
          className="self-start"
          onClick={novaLozinka}
          disabled={radi}
        >
          {radi ? "…" : "Nova lozinka"}
        </Gumb>
      )}
      {greska && <Poruka tip="greska">{greska}</Poruka>}
      {link && (
        <>
          <p className="text-sm text-tekst-2">
            Pošalji ovaj link klijentu. Vrijedi ograničeno vrijeme i samo jednom.
          </p>
          <LinkZaSlanje
            link={link}
            poruka={`Bok ${ime.split(" ")[0]}! Ovdje postavi novu lozinku za INFERNO ENERGY aplikaciju:\n${link}`}
          />
          <Gumb varijanta="sporedni" malen onClick={() => setLink(null)}>
            Zatvori
          </Gumb>
        </>
      )}
    </Kartica>
  );
}
