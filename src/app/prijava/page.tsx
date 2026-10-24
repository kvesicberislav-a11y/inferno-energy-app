"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/Logo";
import { Gumb, Kartica, Polje, Poruka, Stranica } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { pocetnaZa } from "@/lib/tipovi";

export default function Prijava() {
  const { session, profil, ucitava, greska: greskaAplikacije } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [lozinka, setLozinka] = useState("");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);
  const [zaboravljena, setZaboravljena] = useState(false);

  // Već prijavljen? Ravno na svoju početnu.
  useEffect(() => {
    if (!ucitava && session && profil) router.replace(pocetnaZa(profil.uloga));
  }, [ucitava, session, profil, router]);

  async function prijaviSe(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    setSalje(true);
    try {
      const { error } = await supabase().auth.signInWithPassword({
        email: email.trim(),
        password: lozinka,
      });
      if (error) setGreska(prevediGresku(error.message));
    } catch (err) {
      setGreska(prevediGresku(err instanceof Error ? err.message : null));
    } finally {
      setSalje(false);
    }
  }

  return (
    <Stranica>
      <div className="flex flex-col items-center gap-2 pt-10 pb-4">
        <Logo velik />
        <p className="text-tekst-2">Prehrana · Treninzi · Napredak</p>
      </div>

      {greskaAplikacije && <Poruka tip="greska">{greskaAplikacije}</Poruka>}

      <Kartica>
        <form onSubmit={prijaviSe} className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Prijava</h1>
          <Polje
            id="email"
            oznaka="E-mail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Polje
            id="lozinka"
            oznaka="Lozinka"
            type="password"
            autoComplete="current-password"
            required
            value={lozinka}
            onChange={(e) => setLozinka(e.target.value)}
          />
          {greska && <Poruka tip="greska">{greska}</Poruka>}
          <Gumb type="submit" disabled={salje || Boolean(greskaAplikacije)}>
            {salje ? "Prijavljujem…" : "Prijavi se"}
          </Gumb>
        </form>
      </Kartica>

      <button
        type="button"
        onClick={() => setZaboravljena((z) => !z)}
        className="py-2 text-center text-base font-medium text-vatra"
      >
        Zaboravljena lozinka?
      </button>
      {zaboravljena && (
        <Poruka>
          Javi se svom treneru. Poslat će ti link (npr. WhatsAppom) preko kojeg postaviš novu
          lozinku.
        </Poruka>
      )}

      <p className="mt-auto pt-6 text-center text-sm text-tekst-2">
        Nemaš račun? Registracija je moguća samo preko pozivnice trenera.
      </p>
    </Stranica>
  );
}
