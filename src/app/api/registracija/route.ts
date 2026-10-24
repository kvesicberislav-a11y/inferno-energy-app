import { NextResponse } from "next/server";
import { adminKlijent } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function greska(poruka: string, status = 400) {
  return NextResponse.json({ greska: poruka }, { status });
}

/**
 * Registracija klijenta preko pozivnice.
 * Javna registracija je u Supabaseu isključena, pa račun ovdje stvara
 * poslužitelj – ali samo ako je pozivnica valjana i neiskorištena.
 */
export async function POST(request: Request) {
  let tijelo: Record<string, unknown>;
  try {
    tijelo = (await request.json()) as Record<string, unknown>;
  } catch {
    return greska("Neispravan zahtjev.");
  }

  const { kod, ime, email, lozinka } = tijelo;
  if (typeof kod !== "string" || !UUID.test(kod)) return greska("Pozivnica ne vrijedi.");
  if (typeof ime !== "string" || ime.trim().length < 2 || ime.trim().length > 100) {
    return greska("Upiši ime i prezime.");
  }
  if (typeof email !== "string" || !EMAIL.test(email.trim())) {
    return greska("Upiši ispravan e-mail.");
  }
  if (typeof lozinka !== "string" || lozinka.length < 8 || lozinka.length > 72) {
    return greska("Lozinka mora imati barem 8 znakova.");
  }

  let admin;
  try {
    admin = adminKlijent();
  } catch {
    return greska("Poslužitelj još nije podešen.", 500);
  }

  // 1) Zauzmi pozivnicu (samo ako je još slobodna i nije istekla).
  const sada = new Date().toISOString();
  const { data: pozivnica, error: greskaPozivnice } = await admin
    .from("pozivnice")
    .update({ iskoristena_at: sada })
    .eq("kod", kod)
    .is("iskoristena_at", null)
    .gt("vrijedi_do", sada)
    .select("id")
    .maybeSingle();

  if (greskaPozivnice) return greska("Greška na poslužitelju. Pokušaj ponovno.", 500);
  if (!pozivnica) {
    return greska("Ova pozivnica ne vrijedi ili je već iskorištena. Javi se treneru za novu.");
  }

  // 2) Napravi korisnika (profil s ulogom "klijent" nastaje automatski u bazi).
  const { data: novi, error: greskaKorisnika } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: lozinka,
    email_confirm: true,
    user_metadata: { ime: ime.trim() },
  });

  if (greskaKorisnika || !novi.user) {
    // Vrati pozivnicu da se može ponovno iskoristiti.
    await admin.from("pozivnice").update({ iskoristena_at: null }).eq("id", pozivnica.id);
    const kodGreske = greskaKorisnika?.code ?? "";
    if (kodGreske === "email_exists" || /already/i.test(greskaKorisnika?.message ?? "")) {
      return greska("Ovaj e-mail već ima račun. Prijavi se ili se javi treneru.");
    }
    if (kodGreske === "weak_password") {
      return greska("Lozinka je preslaba. Odaberi dužu ili složeniju lozinku.");
    }
    return greska("Registracija nije uspjela. Pokušaj ponovno.", 500);
  }

  await admin.from("pozivnice").update({ iskoristio: novi.user.id }).eq("id", pozivnica.id);

  return NextResponse.json({ ok: true });
}
