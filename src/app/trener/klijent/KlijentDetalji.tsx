"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { NapredakPrikaz } from "@/components/napredak/NapredakPrikaz";
import { Prehrana } from "@/components/prehrana/Prehrana";
import { Poruka, Ucitavanje } from "@/components/ui";
import { aktivnost, type Aktivnost } from "@/lib/aktivnost";
import { formatDatum } from "@/lib/datum";
import type { Profil } from "@/lib/tipovi";
import { supabase } from "@/lib/supabase/client";
import { Biljeske } from "./Biljeske";
import { CiljeviForma } from "./CiljeviForma";
import { Izvoz } from "./Izvoz";
import { NovaLozinka } from "./NovaLozinka";
import { PlanKlijenta } from "./PlanKlijenta";
import { PovijestTreninga } from "./PovijestTreninga";
import { TerminiKlijenta } from "./TerminiKlijenta";
import { VjezbeKlijenta } from "./VjezbeKlijenta";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KARTICE = [
  ["treninzi", "Treninzi"],
  ["prehrana", "Prehrana"],
  ["napredak", "Napredak"],
  ["biljeske", "Bilješke"],
] as const;
type Kartica = (typeof KARTICE)[number][0];

type Ucitano = { id: string; profil: Profil | null; aktivnost: Aktivnost | null };

export function KlijentDetalji() {
  const parametri = useSearchParams();
  const id = parametri.get("id") ?? "";
  const ispravan = UUID.test(id);
  const [ucitano, setUcitano] = useState<Ucitano | null>(null);
  const [verzijaCilja, setVerzijaCilja] = useState(0);
  const [kartica, setKartica] = useState<Kartica>(() => {
    const k = parametri.get("kartica");
    return KARTICE.some(([kljuc]) => kljuc === k) ? (k as Kartica) : "treninzi";
  });

  useEffect(() => {
    if (!ispravan) return;
    let aktivno = true;
    const sb = supabase();
    Promise.all([
      sb.from("profili").select("*").eq("id", id).eq("uloga", "klijent").maybeSingle(),
      sb.rpc("pregled_klijenata"),
    ]).then(([p, pregled]) => {
      if (!aktivno) return;
      const red = ((pregled.data as Record<string, unknown>[] | null) ?? []).find((r) => r.id === id);
      const profil = (p.data as Profil | null) ?? null;
      setUcitano({
        id,
        profil,
        aktivnost:
          red && profil
            ? aktivnost(red.zadnja_aktivnost ? String(red.zadnja_aktivnost) : null, profil.kreirano)
            : null,
      });
    });
    return () => {
      aktivno = false;
    };
  }, [id, ispravan]);

  async function promijeniNacin(novi: "uzivo" | "online") {
    if (!ucitano?.profil || ucitano.profil.nacin === novi) return;
    const { error } = await supabase().rpc("postavi_nacin", { p_klijent: ucitano.profil.id, p_nacin: novi });
    if (!error) setUcitano({ ...ucitano, profil: { ...ucitano.profil, nacin: novi } });
  }

  function promijeniKarticu(k: Kartica) {
    setKartica(k);
    // Zapamti karticu u adresi (povratak "natrag" vraća na istu karticu)
    const url = new URL(window.location.href);
    url.searchParams.set("kartica", k);
    window.history.replaceState(null, "", url);
  }

  const natrag = (
    <Link href="/trener" className="self-start py-2 text-base font-medium text-vatra">
      ‹ Klijenti
    </Link>
  );

  if (ispravan && ucitano?.id !== id) return <Ucitavanje />;

  const profil = ispravan ? ucitano?.profil : null;
  if (!profil) {
    return (
      <>
        {natrag}
        <Poruka tip="greska">Klijent nije pronađen.</Poruka>
      </>
    );
  }

  const a = ucitano?.aktivnost ?? null;
  const ime = profil.ime || profil.email;

  return (
    <>
      {natrag}
      <div className="flex flex-col gap-2">
        <div>
          <h1 className="text-2xl font-bold">{ime}</h1>
          <p className="text-tekst-2">{profil.email}</p>
          <p className="text-sm text-tekst-2">Klijent od {formatDatum(profil.kreirano)}</p>
        </div>
        {a && (
          <div
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
              a.upozorenje ? "border-amber-400/40 bg-amber-400/10 text-amber-100" : "border-rub bg-povrsina text-tekst-2"
            }`}
          >
            <span
              className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-black ${
                a.upozorenje ? "bg-amber-400" : a.danaBez === 0 && !a.nikad ? "bg-emerald-400" : "bg-zinc-500"
              }`}
              aria-hidden="true"
            >
              {a.upozorenje ? "!" : a.danaBez === 0 && !a.nikad ? "✓" : ""}
            </span>
            {a.opis}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-rub bg-povrsina p-1" role="group" aria-label="Način rada">
            {(
              [
                ["uzivo", "Uživo"],
                ["online", "Online"],
              ] as const
            ).map(([k, o]) => (
              <button
                key={k}
                type="button"
                onClick={() => promijeniNacin(k)}
                aria-pressed={(profil.nacin ?? "uzivo") === k}
                className={`h-10 rounded-xl px-4 text-sm font-semibold transition ${
                  (profil.nacin ?? "uzivo") === k
                    ? k === "online"
                      ? "bg-sky-500/25 text-sky-100"
                      : "bg-vatra/25 text-orange-100"
                    : "text-tekst-2"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Izvoz klijentId={profil.id} ime={ime} />
            <NovaLozinka klijentId={profil.id} ime={ime} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-rub bg-povrsina p-1">
        {KARTICE.map(([kljuc, oznaka]) => (
          <button
            key={kljuc}
            type="button"
            onClick={() => promijeniKarticu(kljuc)}
            className={`h-11 rounded-xl text-sm font-semibold transition ${
              kartica === kljuc ? "bg-povrsina-2 text-tekst shadow" : "text-tekst-2"
            }`}
          >
            {oznaka}
          </button>
        ))}
      </div>

      {kartica === "treninzi" && (
        <>
          {(profil.nacin ?? "uzivo") === "uzivo" ? (
            <TerminiKlijenta klijentId={profil.id} ime={ime} />
          ) : (
            <p className="text-sm text-tekst-2">Online klijent – termini s tobom vode se samo za klijente uživo.</p>
          )}
          <PlanKlijenta klijentId={profil.id} />
          <PovijestTreninga klijentId={profil.id} />
          <VjezbeKlijenta klijentId={profil.id} />
        </>
      )}
      {kartica === "prehrana" && (
        <>
          <CiljeviForma klijentId={profil.id} onSpremljeno={() => setVerzijaCilja((v) => v + 1)} />
          <Prehrana key={verzijaCilja} klijentId={profil.id} mozeUredivati={false} />
        </>
      )}
      {kartica === "napredak" && <NapredakPrikaz klijentId={profil.id} jeKlijent={false} />}
      {kartica === "biljeske" && <Biljeske klijentId={profil.id} />}
    </>
  );
}
