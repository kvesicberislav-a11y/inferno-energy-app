import { NextResponse } from "next/server";
import { adminKlijent } from "@/lib/supabase/admin";
import { provjeriKorisnika } from "@/lib/server/korisnik";
import { obavijestiZaPoruke, PORUKA_PO_OBAVIJESTI } from "@/lib/server/obavijesti";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SKUPINE = ["svi", "uzivo", "online"] as const;

function greska(poruka: string, status = 400) {
  return NextResponse.json({ greska: poruka }, { status });
}

/**
 * Nova poruka. Klijent piše treneru. Trener piše jednom klijentu (za = id klijenta)
 * ili skupini (za = "svi" | "uzivo" | "online"). Odmah šalje i obavijest na mobitel.
 */
export async function POST(request: Request) {
  let tijelo: Record<string, unknown>;
  try {
    tijelo = (await request.json()) as Record<string, unknown>;
  } catch {
    return greska("Neispravan zahtjev.");
  }
  const tekst = typeof tijelo.tekst === "string" ? tijelo.tekst.trim() : "";
  if (!tekst) return greska("Poruka je prazna.");
  if (tekst.length > 2000) return greska("Poruka je preduga (najviše 2000 znakova).");
  const za = typeof tijelo.za === "string" ? tijelo.za : "";

  let admin;
  try {
    admin = adminKlijent();
  } catch {
    return greska("Poslužitelj još nije podešen.", 500);
  }

  const korisnik = await provjeriKorisnika(request, admin);
  if ("greska" in korisnik) return greska(korisnik.greska, korisnik.status);

  // Zaštita od slučajnog slanja u petlji (samo klijenti – trenerova poruka skupini upisuje puno redova odjednom)
  if (korisnik.uloga === "klijent") {
    const { count } = await admin
      .from("poruke")
      .select("id", { count: "exact", head: true })
      .eq("autor_id", korisnik.id)
      .gte("kreirano", new Date(Date.now() - 60_000).toISOString());
    if ((count ?? 0) >= 20) return greska("Previše poruka u kratkom vremenu. Pričekaj minutu.", 429);
  }

  let klijenti: string[];
  if (korisnik.uloga === "klijent") {
    klijenti = [korisnik.id];
  } else if (UUID.test(za)) {
    const { data } = await admin.from("profili").select("id").eq("id", za).eq("uloga", "klijent").maybeSingle();
    if (!data) return greska("Klijent nije pronađen.", 404);
    klijenti = [String(data.id)];
  } else if ((SKUPINE as readonly string[]).includes(za)) {
    let upit = admin.from("profili").select("id").eq("uloga", "klijent").eq("aktivan", true);
    if (za !== "svi") upit = upit.eq("nacin", za);
    const { data } = await upit;
    klijenti = (data ?? []).map((r) => String(r.id));
    if (!klijenti.length) return greska("U toj skupini nema klijenata.");
  } else {
    return greska("Odaberi kome šalješ poruku.");
  }

  const { data: nove, error } = await admin
    .from("poruke")
    .insert(
      klijenti.map((klijentId) => ({
        klijent_id: klijentId,
        autor_id: korisnik.id,
        od_trenera: korisnik.uloga === "trener",
        tekst,
      })),
    )
    .select("id, klijent_id, od_trenera, tekst, procitano, kreirano");
  if (error || !nove) return greska("Poruka nije spremljena. Pokušaj ponovno.", 500);

  const ids = nove.map((p) => String(p.id));
  const adresa = new URL(request.url).origin;
  let obavijesti = 0;
  try {
    obavijesti = await obavijestiZaPoruke(admin, ids.slice(0, PORUKA_PO_OBAVIJESTI), korisnik.id, adresa);
  } catch {
    // poruka je spremljena i bez obavijesti
  }

  return NextResponse.json({
    // pojedinačnu poruku odmah prikazujemo u razgovoru
    poruke: nove.length === 1 ? nove : [],
    broj: nove.length,
    obavijesti,
    // za veće skupine preglednik traži ostale obavijesti u manjim dijelovima (/api/obavijesti)
    preostale: ids.slice(PORUKA_PO_OBAVIJESTI),
  });
}
