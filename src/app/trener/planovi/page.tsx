"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Gumb, Kartica, Polje, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

type SazetakPlana = {
  id: string;
  naziv: string;
  arhiviran: boolean;
  brojDana: number;
  brojKlijenata: number;
};

async function dohvatiPlanove(): Promise<{ planovi: SazetakPlana[]; greska: string | null }> {
  const { data, error } = await supabase()
    .from("planovi")
    .select("id, naziv, arhiviran, kreirano, plan_dani(id), dodjele_planova(klijent_id, do_datuma)")
    .order("kreirano", { ascending: false });
  if (error) return { planovi: [], greska: prevediGresku(error.message) };
  const planovi = (data ?? []).map((p) => ({
    id: String(p.id),
    naziv: String(p.naziv),
    arhiviran: Boolean(p.arhiviran),
    brojDana: (p.plan_dani as unknown[] | null)?.length ?? 0,
    brojKlijenata: ((p.dodjele_planova as { do_datuma: string | null }[] | null) ?? []).filter(
      (d) => d.do_datuma === null,
    ).length,
  }));
  planovi.sort((a, b) => Number(a.arhiviran) - Number(b.arhiviran));
  return { planovi, greska: null };
}

function PopisPlanova() {
  const router = useRouter();
  const [podaci, setPodaci] = useState<{ planovi: SazetakPlana[]; greska: string | null } | null>(null);
  const [noviOtvoren, setNoviOtvoren] = useState(false);
  const [naziv, setNaziv] = useState("");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  useEffect(() => {
    let aktivno = true;
    dohvatiPlanove().then((r) => {
      if (aktivno) setPodaci(r);
    });
    return () => {
      aktivno = false;
    };
  }, []);

  async function napravi(e: FormEvent) {
    e.preventDefault();
    if (!naziv.trim()) return;
    setGreska(null);
    setSalje(true);
    const { data, error } = await supabase()
      .from("planovi")
      .insert({ naziv: naziv.trim().slice(0, 80) })
      .select("id")
      .single();
    setSalje(false);
    if (error || !data) return setGreska(prevediGresku(error?.message));
    router.push(`/trener/plan?id=${data.id}`);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl font-bold">Planovi treninga</h1>
        {!noviOtvoren && (
          <Gumb malen onClick={() => setNoviOtvoren(true)}>
            + Novi plan
          </Gumb>
        )}
      </div>

      {noviOtvoren && (
        <Kartica>
          <form onSubmit={napravi} className="flex flex-col gap-4">
            <Polje
              id="plan-naziv"
              oznaka="Naziv plana"
              placeholder="npr. Početnik – 3 dana tjedno"
              maxLength={80}
              autoFocus
              value={naziv}
              onChange={(e) => setNaziv(e.target.value)}
            />
            {greska && <Poruka tip="greska">{greska}</Poruka>}
            <div className="grid grid-cols-2 gap-3">
              <Gumb type="button" varijanta="sporedni" onClick={() => setNoviOtvoren(false)}>
                Odustani
              </Gumb>
              <Gumb type="submit" disabled={salje || !naziv.trim()}>
                {salje ? "…" : "Napravi"}
              </Gumb>
            </div>
          </form>
        </Kartica>
      )}

      {podaci === null ? (
        <Ucitavanje />
      ) : podaci.greska ? (
        <Poruka tip="greska">{podaci.greska}</Poruka>
      ) : podaci.planovi.length === 0 ? (
        <Poruka>Još nema planova. Napravi prvi gumbom „+ Novi plan”.</Poruka>
      ) : (
        <div className="flex flex-col gap-2">
          {podaci.planovi.map((p) => (
            <Link
              key={p.id}
              href={`/trener/plan?id=${p.id}`}
              className={`flex items-center justify-between gap-3 rounded-2xl border border-rub bg-povrsina p-4 active:scale-[0.99] ${
                p.arhiviran ? "opacity-50" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{p.naziv}</p>
                <p className="text-sm text-tekst-2">
                  {p.brojDana} {p.brojDana === 1 ? "dan" : "dana"} tjedno · {p.brojKlijenata}{" "}
                  {p.brojKlijenata === 1 ? "klijent" : "klijenata"}
                  {p.arhiviran ? " · arhiviran" : ""}
                </p>
              </div>
              <span className="text-2xl text-tekst-2" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function TrenerPlanoviStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Zaglavlje />
        <PopisPlanova />
      </Stranica>
    </Zasticeno>
  );
}
