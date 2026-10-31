export type Uloga = "trener" | "klijent";

export type Profil = {
  id: string;
  email: string;
  ime: string;
  uloga: Uloga;
  aktivan: boolean;
  kreirano: string;
  /** klijent: trenira uživo s trenerom ili online */
  nacin?: "uzivo" | "online";
  /** klijent u arhivi (od kada), inače null */
  arhivirano?: string | null;
  /** false = trener ga već vodi, ali se još nije registrirao preko pozivnice */
  registriran?: boolean;
};

export type Pozivnica = {
  id: string;
  kod: string;
  ime: string;
  kreirano: string;
  vrijedi_do: string;
  iskoristena_at: string | null;
  /** pozivnica za klijenta kojeg trener već vodi (bez računa) */
  profil_id?: string | null;
};

export function pocetnaZa(uloga: Uloga) {
  return uloga === "trener" ? "/trener" : "/klijent";
}
