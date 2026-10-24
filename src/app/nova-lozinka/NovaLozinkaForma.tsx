"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Gumb, Kartica, Polje, Poruka, Ucitavanje } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { POSTAVKE_OK, supabase } from "@/lib/supabase/client";

const TOKEN = /^[0-9a-f]{20,128}$/i;

type Provjera = { token: string; ok: boolean };

export function NovaLozinkaForma() {
  const token = useSearchParams().get("token") ?? "";
  const tokenIspravan = TOKEN.test(token);
  const router = useRouter();

  const [provjera, setProvjera] = useState<Provjera | null>(null);
  const pokrenuto = useRef<string | null>(null);
  const [lozinka, setLozinka] = useState("");
  const [lozinka2, setLozinka2] = useState("");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);
  const [gotovo, setGotovo] = useState(false);

  // Link se može iskoristiti samo jednom, zato ga provjeravamo točno jednom.
  useEffect(() => {
    if (!tokenIspravan || !POSTAVKE_OK || pokrenuto.current === token) return;
    pokrenuto.current = token;
    supabase()
      .auth.verifyOtp({ token_hash: token, type: "recovery" })
      .then(({ error }) => setProvjera({ token, ok: !error }));
  }, [token, tokenIspravan]);

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    if (lozinka.length < 8) return setGreska("Lozinka mora imati barem 8 znakova.");
    if (lozinka !== lozinka2) return setGreska("Lozinke se ne podudaraju.");
    setSalje(true);
    try {
      const { error } = await supabase().auth.updateUser({ password: lozinka });
      if (error) setGreska(prevediGresku(error.message));
      else setGotovo(true);
    } catch (err) {
      setGreska(prevediGresku(err instanceof Error ? err.message : null));
    } finally {
      setSalje(false);
    }
  }

  const naslov = (
    <div className="flex flex-col items-center gap-2 pt-8 pb-2">
      <Logo velik />
    </div>
  );

  if (!POSTAVKE_OK) {
    return (
      <>
        {naslov}
        <Poruka tip="greska">Aplikacija još nije povezana s bazom.</Poruka>
      </>
    );
  }

  if (tokenIspravan && provjera?.token !== token) return <Ucitavanje tekst="Provjeravam link…" />;

  if (!tokenIspravan || !provjera?.ok) {
    return (
      <>
        {naslov}
        <Poruka tip="greska">
          Link je istekao ili je već iskorišten. Javi se treneru da ti pošalje novi.
        </Poruka>
        <Gumb varijanta="sporedni" onClick={() => router.replace("/prijava")}>
          Na prijavu
        </Gumb>
      </>
    );
  }

  if (gotovo) {
    return (
      <>
        {naslov}
        <Poruka tip="uspjeh">Lozinka je promijenjena. Prijavljen si.</Poruka>
        <Gumb onClick={() => router.replace("/")}>Nastavi</Gumb>
      </>
    );
  }

  return (
    <>
      {naslov}
      <Kartica>
        <form onSubmit={spremi} className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Nova lozinka</h1>
          <Polje
            id="lozinka"
            oznaka="Nova lozinka (barem 8 znakova)"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={lozinka}
            onChange={(e) => setLozinka(e.target.value)}
          />
          <Polje
            id="lozinka2"
            oznaka="Ponovi lozinku"
            type="password"
            autoComplete="new-password"
            required
            value={lozinka2}
            onChange={(e) => setLozinka2(e.target.value)}
          />
          {greska && <Poruka tip="greska">{greska}</Poruka>}
          <Gumb type="submit" disabled={salje}>
            {salje ? "Spremam…" : "Spremi lozinku"}
          </Gumb>
        </form>
      </Kartica>
    </>
  );
}
