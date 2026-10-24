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
};

export type Pozivnica = {
  id: string;
  kod: string;
  ime: string;
  kreirano: string;
  vrijedi_do: string;
  iskoristena_at: string | null;
};

export function pocetnaZa(uloga: Uloga) {
  return uloga === "trener" ? "/trener" : "/klijent";
}
