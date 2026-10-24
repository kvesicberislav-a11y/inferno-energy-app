import "server-only";

/** Je li slanje e-maila podešeno (ključ usluge i adresa pošiljatelja)? */
export function emailPodesen() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_POSILJATELJ);
}

export function html(tekst: string) {
  return tekst
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Šalje e-mail preko usluge Resend. Vraća null ili poruku greške. */
export async function posaljiEmail(poruka: {
  za: string;
  naslov: string;
  html: string;
  tekst: string;
}): Promise<string | null> {
  const kljuc = process.env.RESEND_API_KEY;
  const od = process.env.EMAIL_POSILJATELJ;
  if (!kljuc || !od) return "E-mail nije podešen.";
  const odgovor = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${kljuc}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: od,
      to: [poruka.za],
      subject: poruka.naslov,
      html: poruka.html,
      text: poruka.tekst,
      ...(process.env.EMAIL_ODGOVOR ? { reply_to: process.env.EMAIL_ODGOVOR } : {}),
    }),
  });
  if (!odgovor.ok) {
    const tijelo = (await odgovor.json().catch(() => ({}))) as { message?: string };
    return tijelo.message ?? `Greška usluge za e-mail (${odgovor.status}).`;
  }
  return null;
}
