import { NextResponse } from "next/server";
import { adminKlijent } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function greska(poruka: string, status = 400) {
  return NextResponse.json({ greska: poruka }, { status });
}

/**
 * Trener traži jednokratni link za novu lozinku klijenta.
 * E-mail se NE šalje – trener link sam pošalje klijentu (npr. WhatsAppom).
 */
export async function POST(request: Request) {
  const pristupniToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!pristupniToken) return greska("Nisi prijavljen.", 401);

  let tijelo: Record<string, unknown>;
  try {
    tijelo = (await request.json()) as Record<string, unknown>;
  } catch {
    return greska("Neispravan zahtjev.");
  }
  const { klijentId } = tijelo;
  if (typeof klijentId !== "string" || !UUID.test(klijentId)) {
    return greska("Neispravan klijent.");
  }

  let admin;
  try {
    admin = adminKlijent();
  } catch {
    return greska("Poslužitelj još nije podešen.", 500);
  }

  // 1) Tko šalje zahtjev? Mora biti aktivan trener.
  const { data: pozivatelj, error: greskaPrijave } = await admin.auth.getUser(pristupniToken);
  if (greskaPrijave || !pozivatelj.user) return greska("Nisi prijavljen.", 401);

  const { data: trener } = await admin
    .from("profili")
    .select("uloga, aktivan")
    .eq("id", pozivatelj.user.id)
    .maybeSingle();
  if (!trener || trener.uloga !== "trener" || !trener.aktivan) {
    return greska("Nemaš ovlasti za ovo.", 403);
  }

  // 2) Link se smije napraviti samo za klijenta (ne za drugog trenera).
  const { data: klijent } = await admin
    .from("profili")
    .select("uloga")
    .eq("id", klijentId)
    .maybeSingle();
  if (!klijent || klijent.uloga !== "klijent") return greska("Klijent nije pronađen.", 404);

  const { data: korisnik, error: greskaKorisnika } = await admin.auth.admin.getUserById(klijentId);
  const email = korisnik?.user?.email;
  if (greskaKorisnika || !email) {
    return greska("Klijent se još nije registrirao – prvo mu pošalji pozivnicu.", 404);
  }

  // 3) Jednokratni token za oporavak lozinke (bez slanja e-maila).
  const { data: link, error: greskaLinka } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const token = link?.properties?.hashed_token;
  if (greskaLinka || !token) return greska("Ne mogu napraviti link. Pokušaj ponovno.", 500);

  return NextResponse.json({ token });
}
