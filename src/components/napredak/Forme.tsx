"use client";

import { useState, type FormEvent } from "react";
import { Ploca } from "@/components/Ploca";
import { Cip, Gumb, Polje, Poruka } from "@/components/ui";
import { danasZagreb, opisDana } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { parsirajBroj } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { MJERE, format1, type KljucMjere, type Mjerenje, type OsobniPodaci, type Spol } from "@/lib/tijelo";

const UPUTE: Partial<Record<KljucMjere, string>> = {
  tezina_kg: "ujutro, prije doručka",
  vrat_cm: "ispod grkljana",
  struk_cm: "u visini pupka, opušteno",
  bokovi_cm: "najširi dio stražnjice",
  prsa_cm: "preko bradavica",
  ruka_cm: "najširi dio nadlaktice",
  bedro_cm: "najširi dio bedra",
};

/** Visina, spol i godina rođenja (potrebno za izračune). */
export function OsobniPodaciForma({
  klijentId,
  pocetno,
  onZatvori,
  onSpremljeno,
}: {
  klijentId: string;
  pocetno: OsobniPodaci;
  onZatvori: () => void;
  onSpremljeno: () => void;
}) {
  const [visina, setVisina] = useState(pocetno.visina_cm ? format1(pocetno.visina_cm) : "");
  const [spol, setSpol] = useState<Spol | null>(pocetno.spol);
  const [godina, setGodina] = useState(pocetno.godina_rodenja ? String(pocetno.godina_rodenja) : "");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    const v = visina.trim() ? parsirajBroj(visina) : null;
    if (visina.trim() && (v === null || v < 100 || v > 250)) return setGreska("Visina mora biti između 100 i 250 cm.");
    const g = godina.trim() ? Number(godina.trim()) : null;
    if (godina.trim() && (!Number.isInteger(g) || g! < 1920 || g! > 2020)) {
      return setGreska("Upiši ispravnu godinu rođenja (npr. 1990).");
    }
    setSalje(true);
    const { error } = await supabase()
      .from("profili")
      .update({ visina_cm: v, spol, godina_rodenja: g })
      .eq("id", klijentId);
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    onSpremljeno();
  }

  return (
    <Ploca naslov="Osobni podaci" onZatvori={onZatvori}>
      <form onSubmit={spremi} className="flex flex-col gap-5">
        <p className="-mt-2 text-sm text-tekst-2">Potrebno za BMI, postotak masti i bazalni metabolizam.</p>
        <Polje
          id="visina"
          oznaka="Visina (cm)"
          inputMode="decimal"
          placeholder="npr. 178"
          value={visina}
          onChange={(e) => setVisina(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Spol</span>
          <div className="grid grid-cols-2 gap-2">
            <Cip aktivan={spol === "m"} className="h-12 text-base" onClick={() => setSpol("m")}>
              Muški
            </Cip>
            <Cip aktivan={spol === "z"} className="h-12 text-base" onClick={() => setSpol("z")}>
              Ženski
            </Cip>
          </div>
        </div>
        <Polje
          id="godina"
          oznaka="Godina rođenja"
          inputMode="numeric"
          placeholder="npr. 1992"
          value={godina}
          onChange={(e) => setGodina(e.target.value)}
        />
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb type="submit" disabled={salje}>
          {salje ? "Spremam…" : "Spremi"}
        </Gumb>
      </form>
    </Ploca>
  );
}

/** Unos ili izmjena mjera za jedan dan. */
export function MjereForma({
  mjerenja,
  pocetniDatum,
  onZatvori,
  onSpremljeno,
}: {
  mjerenja: Mjerenje[];
  pocetniDatum: string;
  onZatvori: () => void;
  onSpremljeno: () => void;
}) {
  const danas = danasZagreb();
  const [datum, setDatum] = useState(pocetniDatum);
  const postojece = mjerenja.find((m) => m.datum === datum) ?? null;
  const [vrijednosti, setVrijednosti] = useState<Record<KljucMjere, string>>(() => uTekst(postojece));
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  function uTekst(m: Mjerenje | null) {
    const r = {} as Record<KljucMjere, string>;
    for (const mj of MJERE) r[mj.kljuc] = m?.[mj.kljuc] != null ? format1(m[mj.kljuc]!) : "";
    return r;
  }

  function promijeniDatum(novi: string) {
    if (!novi || novi > danas) return;
    setDatum(novi);
    setVrijednosti(uTekst(mjerenja.find((m) => m.datum === novi) ?? null));
  }

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    const podaci: Record<string, number | null> = {};
    for (const mj of MJERE) {
      const t = vrijednosti[mj.kljuc].trim();
      if (!t) {
        podaci[mj.kljuc] = null;
        continue;
      }
      const b = parsirajBroj(t);
      if (b === null || b <= 0) return setGreska(`${mj.oznaka}: upiši ispravan broj.`);
      podaci[mj.kljuc] = b;
    }
    if (Object.values(podaci).every((v) => v === null)) return setGreska("Upiši barem jednu mjeru.");

    setSalje(true);
    const { error } = await supabase()
      .from("mjerenja")
      .upsert({ ...podaci, datum }, { onConflict: "klijent_id,datum" });
    setSalje(false);
    if (error) {
      return setGreska(
        /check/i.test(error.message) ? "Neka mjera je izvan razumnog raspona – provjeri brojke." : prevediGresku(error.message),
      );
    }
    onSpremljeno();
  }

  async function obrisi() {
    if (!postojece || !window.confirm(`Obrisati mjere za ${opisDana(datum)}?`)) return;
    setSalje(true);
    const { error } = await supabase().from("mjerenja").delete().eq("id", postojece.id);
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    onSpremljeno();
  }

  return (
    <Ploca naslov={postojece ? "Uredi mjere" : "Nove mjere"} onZatvori={onZatvori}>
      <form onSubmit={spremi} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Datum</span>
          <input
            type="date"
            value={datum}
            max={danas}
            onChange={(e) => promijeniDatum(e.target.value)}
            className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none focus:border-vatra"
          />
        </label>
        <p className="-mt-2 text-sm text-tekst-2">Sve mjere su neobavezne – upiši ono što si izmjerio.</p>
        <div className="grid grid-cols-2 gap-3">
          {MJERE.map((mj) => (
            <label key={mj.kljuc} className={`flex flex-col gap-1 ${mj.kljuc === "tezina_kg" ? "col-span-2" : ""}`}>
              <span className="text-sm font-medium text-tekst">
                {mj.oznaka} <span className="font-normal text-tekst-2">({mj.jedinica})</span>
              </span>
              <input
                inputMode="decimal"
                value={vrijednosti[mj.kljuc]}
                placeholder="—"
                onChange={(e) => setVrijednosti((v) => ({ ...v, [mj.kljuc]: e.target.value }))}
                onFocus={(e) => e.target.select()}
                className="h-14 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-xl font-semibold tabular-nums text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
              />
              {UPUTE[mj.kljuc] && <span className="text-xs text-tekst-2">{UPUTE[mj.kljuc]}</span>}
            </label>
          ))}
        </div>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb type="submit" disabled={salje}>
          {salje ? "Spremam…" : "Spremi mjere"}
        </Gumb>
        {postojece && (
          <Gumb type="button" varijanta="opasni" onClick={obrisi} disabled={salje}>
            Obriši ovaj unos
          </Gumb>
        )}
      </form>
    </Ploca>
  );
}
