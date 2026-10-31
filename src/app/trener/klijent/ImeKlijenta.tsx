"use client";

import { useState, type FormEvent } from "react";
import { Gumb, Polje, Poruka } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

/** Ime klijenta s olovkom ✎: trener ispravi ime ili doda prezime. */
export function ImeKlijenta({
  klijentId,
  ime,
  onPromjena,
}: {
  klijentId: string;
  ime: string;
  onPromjena: (novo: string) => void;
}) {
  const [uredivanje, setUredivanje] = useState(false);
  const [vrijednost, setVrijednost] = useState(ime);
  const [sprema, setSprema] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  function otvori() {
    setVrijednost(ime);
    setGreska(null);
    setUredivanje(true);
  }

  async function spremi(e: FormEvent) {
    e.preventDefault();
    const novo = vrijednost.trim().replace(/\s+/g, " ");
    if (novo.length < 2) {
      setGreska("Upiši ime i prezime.");
      return;
    }
    if (novo === ime) {
      setUredivanje(false);
      return;
    }
    setSprema(true);
    setGreska(null);
    const { data, error } = await supabase().rpc("promijeni_ime_klijenta", { p_klijent: klijentId, p_ime: novo });
    setSprema(false);
    if (error) {
      setGreska(prevediGresku(error.message));
      return;
    }
    onPromjena(typeof data === "string" ? data : novo);
    setUredivanje(false);
  }

  if (!uredivanje) {
    return (
      <h1 className="text-2xl font-bold">
        {ime}{" "}
        <button
          type="button"
          onClick={otvori}
          aria-label="Promijeni ime"
          title="Promijeni ime"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl align-middle text-lg font-normal text-tekst-2 transition active:scale-95"
        >
          ✎
        </button>
      </h1>
    );
  }

  return (
    <form onSubmit={spremi} className="flex flex-col gap-2">
      <Polje
        id="ime-klijenta"
        oznaka="Ime i prezime"
        value={vrijednost}
        onChange={(e) => setVrijednost(e.target.value)}
        onFocus={(e) => {
          const kraj = e.target.value.length;
          e.target.setSelectionRange(kraj, kraj);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setUredivanje(false);
        }}
        maxLength={100}
        autoComplete="off"
        autoCapitalize="words"
        autoFocus
        disabled={sprema}
      />
      {greska && <Poruka tip="greska">{greska}</Poruka>}
      <div className="flex items-center gap-2">
        <Gumb type="submit" malen disabled={sprema}>
          {sprema ? "Spremam…" : "Spremi"}
        </Gumb>
        <button
          type="button"
          onClick={() => setUredivanje(false)}
          disabled={sprema}
          className="h-11 px-3 text-base font-medium text-tekst-2"
        >
          Odustani
        </button>
      </div>
    </form>
  );
}
