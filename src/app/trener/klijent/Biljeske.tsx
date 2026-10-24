"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Gumb, Kartica, Poruka } from "@/components/ui";
import { formatDatum } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

type Biljeska = { id: string; tekst: string; kreirano: string; azurirano: string };
type Podaci = { klijentId: string; biljeske: Biljeska[]; greska: string | null };

async function dohvati(klijentId: string): Promise<Podaci> {
  const { data, error } = await supabase()
    .from("biljeske_trenera")
    .select("id, tekst, kreirano, azurirano")
    .eq("klijent_id", klijentId)
    .order("kreirano", { ascending: false });
  return {
    klijentId,
    biljeske: (data ?? []).map((b) => ({
      id: String(b.id),
      tekst: String(b.tekst),
      kreirano: String(b.kreirano),
      azurirano: String(b.azurirano),
    })),
    greska: error ? prevediGresku(error.message) : null,
  };
}

/** Bilješke trenera o klijentu – klijent ih nikad ne vidi. */
export function Biljeske({ klijentId }: { klijentId: string }) {
  const [podaci, setPodaci] = useState<Podaci | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [nova, setNova] = useState("");
  const [uredivanje, setUredivanje] = useState<{ id: string; tekst: string } | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  useEffect(() => {
    let aktivno = true;
    dohvati(klijentId).then((r) => {
      if (aktivno) setPodaci(r);
    });
    return () => {
      aktivno = false;
    };
  }, [klijentId, verzija]);

  const osvjezi = () => setVerzija((v) => v + 1);

  async function dodaj(e: FormEvent) {
    e.preventDefault();
    if (!nova.trim()) return;
    setGreska(null);
    setSalje(true);
    const { error } = await supabase()
      .from("biljeske_trenera")
      .insert({ klijent_id: klijentId, tekst: nova.trim().slice(0, 5000) });
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    setNova("");
    osvjezi();
  }

  async function spremiIzmjenu() {
    if (!uredivanje || !uredivanje.tekst.trim()) return;
    setGreska(null);
    setSalje(true);
    const { error } = await supabase()
      .from("biljeske_trenera")
      .update({ tekst: uredivanje.tekst.trim().slice(0, 5000), azurirano: new Date().toISOString() })
      .eq("id", uredivanje.id);
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    setUredivanje(null);
    osvjezi();
  }

  async function obrisi(id: string) {
    if (!window.confirm("Obrisati ovu bilješku?")) return;
    const { error } = await supabase().from("biljeske_trenera").delete().eq("id", id);
    if (error) return setGreska(prevediGresku(error.message));
    osvjezi();
  }

  const biljeske = podaci?.klijentId === klijentId ? podaci.biljeske : null;
  const poljeStil =
    "w-full rounded-2xl border border-rub bg-povrsina-2 px-4 py-3 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30";

  return (
    <Kartica className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-semibold">Moje bilješke</h3>
        <p className="text-sm text-tekst-2">Vidiš ih samo ti – klijent ih ne vidi.</p>
      </div>

      <form onSubmit={dodaj} className="flex flex-col gap-2">
        <textarea
          aria-label="Nova bilješka"
          rows={3}
          maxLength={5000}
          placeholder="npr. ozljeda koljena 2024., ne voli ribu, cilj vjenčanje u lipnju…"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          className={poljeStil}
        />
        <Gumb type="submit" malen className="self-end" disabled={salje || !nova.trim()}>
          Dodaj bilješku
        </Gumb>
      </form>

      {(podaci?.greska || greska) && <Poruka tip="greska">{podaci?.greska ?? greska}</Poruka>}

      {biljeske === null ? (
        <p className="text-sm text-tekst-2">Učitavam…</p>
      ) : biljeske.length === 0 ? (
        <p className="text-sm text-tekst-2">Još nema bilježaka.</p>
      ) : (
        biljeske.map((b) =>
          uredivanje?.id === b.id ? (
            <div key={b.id} className="flex flex-col gap-2 rounded-2xl border border-vatra/50 p-3">
              <textarea
                aria-label="Uredi bilješku"
                rows={4}
                maxLength={5000}
                value={uredivanje.tekst}
                onChange={(e) => setUredivanje({ id: b.id, tekst: e.target.value })}
                className={poljeStil}
              />
              <div className="grid grid-cols-2 gap-2">
                <Gumb varijanta="sporedni" malen onClick={() => setUredivanje(null)}>
                  Odustani
                </Gumb>
                <Gumb malen onClick={spremiIzmjenu} disabled={salje}>
                  Spremi
                </Gumb>
              </div>
            </div>
          ) : (
            <div key={b.id} className="flex flex-col gap-1.5 rounded-2xl border border-rub bg-povrsina-2 p-3">
              <p className="whitespace-pre-line">{b.tekst}</p>
              <div className="flex items-center justify-between gap-3 text-xs text-tekst-2">
                <span>
                  {formatDatum(b.kreirano)}
                  {b.azurirano.slice(0, 16) !== b.kreirano.slice(0, 16) ? " · izmijenjeno" : ""}
                </span>
                <span className="flex gap-4">
                  <button type="button" onClick={() => setUredivanje({ id: b.id, tekst: b.tekst })} className="font-medium text-vatra">
                    Uredi
                  </button>
                  <button type="button" onClick={() => obrisi(b.id)} className="text-red-300">
                    Obriši
                  </button>
                </span>
              </div>
            </div>
          ),
        )
      )}
    </Kartica>
  );
}
