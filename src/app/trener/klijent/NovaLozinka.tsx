"use client";

import { useState } from "react";
import { LinkZaSlanje } from "@/components/LinkZaSlanje";
import { Gumb, Poruka } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

/** Trener pravi jednokratni link za novu lozinku i šalje ga klijentu (npr. WhatsAppom). */
export function NovaLozinka({ klijentId, ime }: { klijentId: string; ime: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  async function napravi() {
    if (!window.confirm(`Napraviti link za novu lozinku za ${ime}?`)) return;
    setGreska(null);
    setRadi(true);
    try {
      const { data } = await supabase().auth.getSession();
      const odgovor = await fetch("/api/reset-lozinke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ klijentId }),
      });
      const rezultat = (await odgovor.json().catch(() => ({}))) as { token?: string; greska?: string };
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

  if (link) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-rub bg-povrsina p-4">
        <p className="text-sm text-tekst-2">
          Pošalji ovaj link klijentu. Vrijedi 24 sata i može se iskoristiti samo jednom.
        </p>
        <LinkZaSlanje
          link={link}
          poruka={`Bok ${ime.split(" ")[0]}! Ovdje postavi novu lozinku za INFERNO ENERGY aplikaciju:\n${link}`}
        />
        <Gumb varijanta="sporedni" malen onClick={() => setLink(null)}>
          Zatvori
        </Gumb>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Gumb varijanta="sporedni" malen className="self-start" onClick={napravi} disabled={radi}>
        {radi ? "…" : "Nova lozinka"}
      </Gumb>
      {greska && <Poruka tip="greska">{greska}</Poruka>}
    </div>
  );
}
