import { NextResponse } from "next/server";
import { adminKlijent } from "@/lib/supabase/admin";
import { provjeriKorisnika } from "@/lib/server/korisnik";
import { obavijestiZaPoruke, PORUKA_PO_OBAVIJESTI } from "@/lib/server/obavijesti";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function greska(poruka: string, status = 400) {
  return NextResponse.json({ greska: poruka }, { status });
}

/**
 * Obavijesti za poruku poslanu velikoj skupini klijenata, u dijelovima od 10.
 * Svaka poruka dobiva obavijest samo jednom i samo ako ju je poslao isti korisnik.
 */
export async function POST(request: Request) {
  let tijelo: Record<string, unknown>;
  try {
    tijelo = (await request.json()) as Record<string, unknown>;
  } catch {
    return greska("Neispravan zahtjev.");
  }
  const ids = Array.isArray(tijelo.ids) ? tijelo.ids.filter((i): i is string => typeof i === "string" && UUID.test(i)) : [];
  if (!ids.length || ids.length > PORUKA_PO_OBAVIJESTI) return greska("Neispravan popis poruka.");

  let admin;
  try {
    admin = adminKlijent();
  } catch {
    return greska("Poslužitelj još nije podešen.", 500);
  }
  const korisnik = await provjeriKorisnika(request, admin);
  if ("greska" in korisnik) return greska(korisnik.greska, korisnik.status);

  const poslano = await obavijestiZaPoruke(admin, ids, korisnik.id, new URL(request.url).origin);
  return NextResponse.json({ poslano });
}
