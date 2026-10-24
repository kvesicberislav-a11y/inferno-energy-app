/** Prevodi poruke grešaka iz Supabasea na hrvatski. */
export function prevediGresku(poruka: string | undefined | null): string {
  const p = (poruka ?? "").toLowerCase();
  if (p.includes("invalid login credentials")) return "Pogrešan e-mail ili lozinka.";
  if (p.includes("email not confirmed")) return "E-mail još nije potvrđen.";
  if (p.includes("rate limit") || p.includes("too many")) {
    return "Previše pokušaja. Pričekaj malo pa pokušaj ponovno.";
  }
  if (p.includes("password should be")) return "Lozinka mora imati barem 8 znakova.";
  if (p.includes("should be different")) return "Nova lozinka mora biti drugačija od stare.";
  if (p.includes("failed to fetch") || p.includes("network")) {
    return "Nema veze s poslužiteljem. Provjeri internet.";
  }
  return `Nešto je pošlo po zlu (${poruka ?? "nepoznata greška"}).`;
}
