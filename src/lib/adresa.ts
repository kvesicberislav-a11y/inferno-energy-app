/** Prava (javna) adresa aplikacije. */
export const JAVNA_ADRESA = "https://infernoenergy.hr";

/**
 * Adresa za linkove koje trener šalje klijentima (pozivnica, nova lozinka, instalacija).
 * Na testnoj workers.dev adresi link ipak vodi na pravu aplikaciju.
 */
export function adresaZaKlijente(): string {
  return window.location.hostname.endsWith(".workers.dev") ? JAVNA_ADRESA : window.location.origin;
}
