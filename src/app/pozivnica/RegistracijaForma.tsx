"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Logo } from "@/components/Logo";
import { Gumb, Kartica, Polje, Poruka, Ucitavanje } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { POSTAVKE_OK, supabase } from "@/lib/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Provjera = { kod: string; ime: string | null; greska: boolean };

export function RegistracijaForma() {
  const kod = useSearchParams().get("kod") ?? "";
  const kodIspravan = UUID.test(kod);
  const { session, odjava } = useAuth();
  const router = useRouter();

  const [provjera, setProvjera] = useState<Provjera | null>(null);
  const [ime, setIme] = useState("");
  const [email, setEmail] = useState("");
  const [lozinka, setLozinka] = useState("");
  const [lozinka2, setLozinka2] = useState("");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);
  const [zavrseno, setZavrseno] = useState(false);

  // Provjeri vrijedi li pozivnica.
  useEffect(() => {
    if (!kodIspravan || !POSTAVKE_OK) return;
    let aktivno = true;
    supabase()
      .rpc("provjeri_pozivnicu", { p_kod: kod })
      .then(({ data, error }) => {
        if (!aktivno) return;
        const imeIzPozivnice = typeof data === "string" ? data : null;
        setProvjera({ kod, ime: imeIzPozivnice, greska: Boolean(error) });
        if (imeIzPozivnice) setIme(imeIzPozivnice);
      });
    return () => {
      aktivno = false;
    };
  }, [kod, kodIspravan]);

  async function registriraj(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    if (lozinka.length < 8) return setGreska("Lozinka mora imati barem 8 znakova.");
    if (lozinka !== lozinka2) return setGreska("Lozinke se ne podudaraju.");

    setSalje(true);
    try {
      const odgovor = await fetch("/api/registracija", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kod, ime: ime.trim(), email: email.trim(), lozinka }),
      });
      const rezultat = (await odgovor.json().catch(() => ({}))) as { greska?: string };
      if (!odgovor.ok) {
        setGreska(rezultat.greska ?? "Registracija nije uspjela. Pokušaj ponovno.");
        return;
      }
      setZavrseno(true);
      const { error } = await supabase().auth.signInWithPassword({
        email: email.trim(),
        password: lozinka,
      });
      if (error) {
        setZavrseno(false);
        setGreska("Račun je napravljen, ali prijava nije uspjela. Pokušaj se prijaviti.");
        return;
      }
      router.replace("/");
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

  if (zavrseno) return <Ucitavanje tekst="Račun je napravljen, prijavljujem…" />;

  if (kodIspravan && provjera?.kod !== kod) return <Ucitavanje tekst="Provjeravam pozivnicu…" />;

  if (!kodIspravan || !provjera?.ime) {
    return (
      <>
        {naslov}
        <Poruka tip="greska">
          {provjera?.greska
            ? "Ne mogu provjeriti pozivnicu. Provjeri internet i pokušaj ponovno."
            : "Ova pozivnica ne vrijedi ili je već iskorištena. Javi se treneru za novu."}
        </Poruka>
      </>
    );
  }

  if (session) {
    return (
      <>
        {naslov}
        <Kartica className="flex flex-col gap-4">
          <p>
            Trenutno si prijavljen kao <strong>{session.user.email}</strong>. Za novi račun
            se prvo odjavi.
          </p>
          <Gumb varijanta="sporedni" onClick={() => odjava()}>
            Odjavi se
          </Gumb>
        </Kartica>
      </>
    );
  }

  return (
    <>
      {naslov}
      <Kartica>
        <form onSubmit={registriraj} className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dobrodošao/la!</h1>
            <p className="mt-1 text-tekst-2">Napravi svoj račun za praćenje prehrane i treninga.</p>
          </div>
          <Polje
            id="ime"
            oznaka="Ime i prezime"
            autoComplete="name"
            required
            value={ime}
            onChange={(e) => setIme(e.target.value)}
          />
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
            oznaka="Lozinka (barem 8 znakova)"
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
            {salje ? "Stvaram račun…" : "Napravi račun"}
          </Gumb>
        </form>
      </Kartica>
    </>
  );
}
