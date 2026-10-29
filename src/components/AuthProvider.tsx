"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { iskljuciNaOvomUredaju } from "@/lib/obavijesti";
import { POSTAVKE_OK, supabase } from "@/lib/supabase/client";
import type { Profil } from "@/lib/tipovi";

type AuthStanje = {
  session: Session | null;
  profil: Profil | null;
  /** true dok ne znamo je li korisnik prijavljen i koji mu je profil */
  ucitava: boolean;
  greska: string | null;
  /** ponovno učitaj profil (nakon greške veze) */
  pokusajPonovno: () => void;
  odjava: () => Promise<void>;
};

const AuthContext = createContext<AuthStanje | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sesijaPoznata, setSesijaPoznata] = useState(false);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [profilZa, setProfilZa] = useState<string | null>(null);
  const [greskaProfila, setGreskaProfila] = useState<string | null>(null);
  const [pokusaj, setPokusaj] = useState(0);
  const pokusajPonovno = useCallback(() => setPokusaj((p) => p + 1), []);

  // Prati prijavu/odjavu (i automatsko osvježavanje sesije).
  useEffect(() => {
    if (!POSTAVKE_OK) return;
    const { data } = supabase().auth.onAuthStateChange((_dogadaj, novaSesija) => {
      setSession(novaSesija);
      setSesijaPoznata(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Kad znamo tko je prijavljen, učitaj njegov profil (ulogu i ime).
  const korisnikId = session?.user.id ?? null;
  useEffect(() => {
    if (!korisnikId) return;
    let aktivno = true;
    supabase()
      .from("profili")
      .select("*")
      .eq("id", korisnikId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!aktivno) return;
        setProfil((data as Profil | null) ?? null);
        setGreskaProfila(
          error
            ? "Ne mogu se povezati s aplikacijom. Provjeri internet i pokušaj ponovno."
            : !data
              ? "Tvoj profil nije pronađen. Javi se treneru."
              : null,
        );
        setProfilZa(korisnikId);
      });
    return () => {
      aktivno = false;
    };
  }, [korisnikId, pokusaj]);

  // Nakon greške veze: pokušaj ponovno čim se internet vrati ili se aplikacija ponovno otvori
  const imaGreskuVeze = greskaProfila !== null && profil === null;
  useEffect(() => {
    if (!imaGreskuVeze) return;
    const ponovno = () => {
      if (document.visibilityState === "visible") pokusajPonovno();
    };
    window.addEventListener("online", ponovno);
    document.addEventListener("visibilitychange", ponovno);
    return () => {
      window.removeEventListener("online", ponovno);
      document.removeEventListener("visibilitychange", ponovno);
    };
  }, [imaGreskuVeze, pokusajPonovno]);

  const odjava = useCallback(async () => {
    // ovaj mobitel više ne prima obavijesti za tog korisnika (najviše 3 s čekanja, odjava uvijek prolazi)
    await Promise.race([iskljuciNaOvomUredaju(), new Promise((r) => setTimeout(r, 3000))]);
    await supabase().auth.signOut();
  }, []);

  const profilSpreman = korisnikId !== null && profilZa === korisnikId;
  const greska = !POSTAVKE_OK
    ? "Aplikacija još nije povezana s bazom (nedostaju Supabase postavke)."
    : profilSpreman
      ? greskaProfila
      : null;

  const vrijednost: AuthStanje = {
    session,
    profil: profilSpreman ? profil : null,
    ucitava: POSTAVKE_OK && (!sesijaPoznata || (korisnikId !== null && !profilSpreman)),
    greska,
    pokusajPonovno,
    odjava,
  };

  return <AuthContext.Provider value={vrijednost}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const stanje = useContext(AuthContext);
  if (!stanje) throw new Error("useAuth se mora koristiti unutar AuthProvider-a.");
  return stanje;
}
