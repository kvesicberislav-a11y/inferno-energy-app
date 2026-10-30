"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ploca } from "@/components/Ploca";
import { useDanas } from "@/components/useDanas";
import { Gumb, Kartica, Polje, Poruka } from "@/components/ui";
import { puniDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { DANI_KRATKO, nazivDana, tjedanCiklusa } from "@/lib/treninzi";

type DanSazetak = { tjedan: number; dan_u_tjednu: number; naziv: string; skupine: string[] };
type Program = { id: string; naziv: string; od: string; ciklus: number; pocetak: string; dani: DanSazetak[] };
type Podaci = { klijentId: string; program: Program | null; greska: string | null };

function uDane(r: unknown): DanSazetak[] {
  return ((r as Record<string, unknown>[] | null) ?? [])
    .map((d) => ({
      tjedan: Number(d.tjedan ?? 1),
      dan_u_tjednu: Number(d.dan_u_tjednu),
      naziv: String(d.naziv ?? ""),
      skupine: Array.isArray(d.skupine) ? (d.skupine as unknown[]).map(String) : [],
    }))
    .sort((a, b) => a.tjedan - b.tjedan || a.dan_u_tjednu - b.dan_u_tjednu);
}

async function dohvati(klijentId: string): Promise<Podaci> {
  const { data, error } = await supabase()
    .from("dodjele_planova")
    .select("plan_id, od_datuma, plan:planovi(naziv, ciklus_tjedana, pocetak, plan_dani(tjedan, dan_u_tjednu, naziv, skupine))")
    .eq("klijent_id", klijentId)
    .is("do_datuma", null)
    .maybeSingle();
  if (error) return { klijentId, program: null, greska: prevediGresku(error.message) };
  if (!data) return { klijentId, program: null, greska: null };
  const p = (Array.isArray(data.plan) ? data.plan[0] : data.plan) as Record<string, unknown> | null;
  return {
    klijentId,
    greska: null,
    program: {
      id: String(data.plan_id),
      naziv: String(p?.naziv ?? "Program"),
      od: String(data.od_datuma),
      ciklus: Number(p?.ciklus_tjedana ?? 1),
      pocetak: String(p?.pocetak ?? ""),
      dani: uDane(p?.plan_dani),
    },
  };
}

/** Trener: program treninga klijenta (izrada, kopiranje od drugog klijenta, uređivanje). */
export function ProgramKlijenta({
  klijentId,
  ime,
  samoAkoPostoji = false,
}: {
  klijentId: string;
  ime: string;
  /** klijent uživo: prikaži karticu samo ako mu je ostao stari program (da ga se može ukloniti) */
  samoAkoPostoji?: boolean;
}) {
  const danas = useDanas();
  const [podaci, setPodaci] = useState<Podaci | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [novi, setNovi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    let aktivno = true;
    dohvati(klijentId).then((r) => {
      if (aktivno) setPodaci(r);
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, verzija]);

  async function ukloni() {
    if (!window.confirm(`Ukloniti program klijentu ${ime}? Ostaje spremljen u povijesti, ali ga klijent više ne vidi.`)) return;
    setGreska(null);
    const { error } = await supabase().rpc("dodijeli_plan", { p_klijent: klijentId, p_plan: null });
    if (error) return setGreska(prevediGresku(error.message));
    setVerzija((v) => v + 1);
  }

  const spremno = podaci?.klijentId === klijentId;
  const program = spremno ? podaci.program : null;
  const tjedan = program ? tjedanCiklusa({ ciklus_tjedana: program.ciklus, pocetak: program.pocetak }, danas) : 1;
  const ovajTjedan = program?.dani.filter((d) => d.tjedan === tjedan) ?? [];
  if (samoAkoPostoji && (!spremno || !program)) return null;

  return (
    <>
      <Kartica className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Program treninga</h3>
          {program && program.ciklus > 1 && (
            <span className="text-sm text-tekst-2">
              ciklus {program.ciklus} tj. · sada {tjedan}.
            </span>
          )}
        </div>

        {!spremno ? (
          <p className="text-tekst-2">Učitavam…</p>
        ) : podaci.greska ? (
          <Poruka tip="greska">{podaci.greska}</Poruka>
        ) : program ? (
          <>
            <Link href={`/trener/plan?id=${program.id}`} className="text-xl font-bold text-tekst">
              {program.naziv} <span className="text-tekst-2">›</span>
            </Link>
            {ovajTjedan.length === 0 ? (
              <p className="text-sm text-tekst-2">
                {program.dani.length === 0 ? "Program je još prazan." : "Ovaj tjedan nema treninga."}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {ovajTjedan.map((d) => (
                  <p key={`${d.tjedan}-${d.dan_u_tjednu}`} className="flex gap-3 text-sm">
                    <span className="w-8 shrink-0 font-semibold text-tekst-2">{DANI_KRATKO[d.dan_u_tjednu - 1]}</span>
                    <span className="truncate">{nazivDana(d)}</span>
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs text-tekst-2">Vrijedi od {puniDatum(program.od)}</p>
          </>
        ) : (
          <p className="text-tekst-2">Klijent još nema program.</p>
        )}

        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {samoAkoPostoji && (
          <Poruka>Klijent je uživo, pa ovaj program ne vidi. Treninge mu slažeš u Rasporedu. Program možeš ukloniti.</Poruka>
        )}

        {spremno && !samoAkoPostoji && (
          <div className="grid grid-cols-2 gap-2">
            {program ? (
              <>
                <Link
                  href={`/trener/plan?id=${program.id}`}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-linear-to-r from-vatra to-vatra-2 px-4 font-semibold text-white active:scale-[0.98]"
                >
                  Uredi program
                </Link>
                <Gumb varijanta="sporedni" malen onClick={() => setNovi(true)}>
                  Novi program
                </Gumb>
              </>
            ) : (
              <Gumb malen className="col-span-2" onClick={() => setNovi(true)}>
                + Napravi program
              </Gumb>
            )}
          </div>
        )}
        {program && (
          <button type="button" onClick={ukloni} className="self-start text-sm text-red-300">
            Ukloni program
          </button>
        )}
      </Kartica>

      {novi && (
        <NoviProgram
          klijentId={klijentId}
          trenutni={program}
          onZatvori={() => setNovi(false)}
        />
      )}
    </>
  );
}

type Izvor = { planId: string; naziv: string; vlasnik: string; dana: number; ciklus: number; svoj: boolean };

/** Novi program: prazan ili kopija (trenutnog ili programa drugog klijenta). */
function NoviProgram({
  klijentId,
  trenutni,
  onZatvori,
}: {
  klijentId: string;
  trenutni: Program | null;
  onZatvori: () => void;
}) {
  const router = useRouter();
  const [naziv, setNaziv] = useState(trenutni ? "" : "Program");
  const [izvori, setIzvori] = useState<Izvor[] | null>(null);
  const [izvor, setIzvor] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("dodjele_planova")
      .select("plan_id, klijent_id, klijent:profili(ime, email, aktivan), plan:planovi(naziv, ciklus_tjedana, plan_dani(id))")
      .is("do_datuma", null)
      .then(({ data }) => {
        if (!aktivno) return;
        const redovi = (data ?? []).flatMap((r) => {
          const k = (Array.isArray(r.klijent) ? r.klijent[0] : r.klijent) as Record<string, unknown> | null;
          const p = (Array.isArray(r.plan) ? r.plan[0] : r.plan) as Record<string, unknown> | null;
          const dana = ((p?.plan_dani as unknown[] | null) ?? []).length;
          if (!p || dana === 0) return [];
          return [
            {
              planId: String(r.plan_id),
              naziv: String(p.naziv ?? "Program"),
              vlasnik: String(k?.ime || k?.email || "Klijent"),
              dana,
              ciklus: Number(p.ciklus_tjedana ?? 1),
              svoj: String(r.klijent_id) === klijentId,
            },
          ];
        });
        redovi.sort((a, b) => Number(b.svoj) - Number(a.svoj) || a.vlasnik.localeCompare(b.vlasnik, "hr"));
        setIzvori(redovi);
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId]);

  async function napravi() {
    if (!naziv.trim()) return setGreska("Upiši naziv programa (npr. Faza 2).");
    setGreska(null);
    setRadi(true);
    const { data, error } = await supabase().rpc("novi_program", {
      p_klijent: klijentId,
      p_naziv: naziv.trim().slice(0, 80),
      p_izvor: izvor,
    });
    if (error || !data) {
      setRadi(false);
      return setGreska(prevediGresku(error?.message));
    }
    router.push(`/trener/plan?id=${String(data)}`);
  }

  const opcija = (kljuc: string | null, naslov: string, opis: string) => (
    <button
      key={kljuc ?? "prazan"}
      type="button"
      onClick={() => setIzvor(kljuc)}
      aria-pressed={izvor === kljuc}
      className={`flex w-full flex-col rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
        izvor === kljuc ? "border-vatra bg-vatra/10" : "border-rub bg-povrsina-2"
      }`}
    >
      <span className="font-semibold">{naslov}</span>
      <span className="text-sm text-tekst-2">{opis}</span>
    </button>
  );

  return (
    <Ploca naslov="Novi program" onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <Polje
          id="novi-program-naziv"
          oznaka="Naziv programa"
          placeholder="npr. Faza 2 – hipertrofija"
          maxLength={80}
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Kako počinje?</span>
          {opcija(null, "Prazan program", "Slažeš ga od nule.")}
          {izvori === null ? (
            <p className="text-sm text-tekst-2">Učitavam programe…</p>
          ) : (
            izvori.map((x) =>
              opcija(
                x.planId,
                x.svoj ? `Kopija trenutnog: ${x.naziv}` : `Kopija od: ${x.vlasnik}`,
                `${x.svoj ? "" : `${x.naziv} · `}${x.dana} ${x.dana === 1 ? "trening" : "treninga"}${
                  x.ciklus > 1 ? ` · ciklus ${x.ciklus} tj.` : ""
                }`,
              ),
            )
          )}
        </div>
        {trenutni && (
          <p className="text-sm text-tekst-2">
            Trenutni program „{trenutni.naziv}” prestaje vrijediti danas. Ostaje spremljen u povijesti.
          </p>
        )}
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb onClick={napravi} disabled={radi}>
          {radi ? "Radim…" : "Napravi i uredi"}
        </Gumb>
      </div>
    </Ploca>
  );
}
