import { NextResponse } from "next/server";
import { danasZagreb, dodajDane } from "@/lib/datum";
import { opisTermina, razvijTermine, uDodatni, uIznimku, uPravilo } from "@/lib/raspored";
import { adminKlijent } from "@/lib/supabase/admin";
import { emailPodesen, html, posaljiEmail } from "@/lib/server/email";
import { provjeriTrenera } from "@/lib/server/trener";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function greska(poruka: string, status = 400) {
  return NextResponse.json({ poslano: false, greska: poruka }, { status });
}

/**
 * Trener je promijenio raspored klijenta → klijent dobiva e-mail s opisom promjene
 * i svojim terminima za sljedeća 2 tjedna.
 */
export async function POST(request: Request) {
  let tijelo: Record<string, unknown>;
  try {
    tijelo = (await request.json()) as Record<string, unknown>;
  } catch {
    return greska("Neispravan zahtjev.");
  }
  const { klijentId, promjena } = tijelo;
  if (typeof klijentId !== "string" || !UUID.test(klijentId)) return greska("Neispravan klijent.");
  const opisPromjene = typeof promjena === "string" ? promjena.slice(0, 500) : "";

  let admin;
  try {
    admin = adminKlijent();
  } catch {
    return greska("Poslužitelj još nije podešen.", 500);
  }

  const trener = await provjeriTrenera(request, admin);
  if ("greska" in trener) return greska(trener.greska, trener.status);

  if (!emailPodesen()) return NextResponse.json({ poslano: false, razlog: "nije_podeseno" });

  const { data: klijent } = await admin
    .from("profili")
    .select("ime, email, uloga")
    .eq("id", klijentId)
    .maybeSingle();
  if (!klijent || klijent.uloga !== "klijent" || !klijent.email) return greska("Klijent nije pronađen.", 404);

  const danas = danasZagreb();
  const doDana = dodajDane(danas, 13);
  const [p, d] = await Promise.all([
    admin.from("termini_pravila").select("*, iznimke:termini_iznimke(*)").eq("klijent_id", klijentId),
    admin.from("termini_dodatni").select("*").eq("klijent_id", klijentId).gte("datum", danas).lte("datum", doDana),
  ]);
  const pravila = (p.data ?? []).map(uPravilo);
  const iznimke = (p.data ?? []).flatMap((r) => ((r.iznimke as Record<string, unknown>[] | null) ?? []).map(uIznimku));
  const termini = razvijTermine(pravila, iznimke, (d.data ?? []).map(uDodatni), danas, doDana);

  const ime = String(klijent.ime || "").split(" ")[0];
  const adresa = new URL(request.url).origin;
  const redovi = termini.map((t) => ({
    opis: opisTermina(t),
    trajanje: `${t.trajanje} min`,
    stanje: t.otkazan ? "otkazano" : t.iznimka ? "pomaknuto" : "",
  }));

  const tekst = [
    `Bok${ime ? ` ${ime}` : ""}!`,
    "",
    opisPromjene || "Tvoj raspored treninga je promijenjen.",
    "",
    "Tvoji termini u sljedeća 2 tjedna:",
    ...(redovi.length ? redovi.map((r) => `- ${r.opis} (${r.trajanje})${r.stanje ? ` – ${r.stanje}` : ""}`) : ["- nema termina"]),
    "",
    `Raspored uvijek vidiš u aplikaciji: ${adresa}/klijent/trening`,
    "",
    "INFERNO ENERGY",
  ].join("\n");

  const htmlRedovi = redovi.length
    ? redovi
        .map(
          (r) => `<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #eee;${r.stanje === "otkazano" ? "text-decoration:line-through;color:#999;" : ""}">${html(r.opis)}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#666;white-space:nowrap;">${html(r.trajanje)}${r.stanje ? ` · <strong style="color:${r.stanje === "otkazano" ? "#dc2626" : "#d97706"}">${html(r.stanje)}</strong>` : ""}</td>
</tr>`,
        )
        .join("")
    : `<tr><td style="padding:10px 12px;color:#666;">Nema termina u sljedeća 2 tjedna.</td></tr>`;

  const htmlPoruka = `<!doctype html>
<html lang="hr"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#18181b;">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0a0a0b;border-radius:16px 16px 0 0;padding:20px 24px;">
      <span style="font-size:22px;font-weight:900;color:#f97316;">INFERNO</span>
      <span style="font-size:22px;font-weight:900;color:#ffffff;"> ENERGY</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px;">
      <p style="margin:0 0 12px;font-size:17px;">Bok${ime ? ` ${html(ime)}` : ""}!</p>
      <p style="margin:0 0 20px;font-size:17px;line-height:1.5;"><strong>${html(opisPromjene || "Tvoj raspored treninga je promijenjen.")}</strong></p>
      <p style="margin:0 0 8px;font-size:15px;color:#666;">Tvoji termini u sljedeća 2 tjedna:</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">${htmlRedovi}</table>
      <p style="margin:24px 0 0;">
        <a href="${html(adresa)}/klijent/trening" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px;">Otvori aplikaciju</a>
      </p>
    </div>
  </div>
</body></html>`;

  const g = await posaljiEmail({
    za: String(klijent.email),
    naslov: "Promjena rasporeda treninga – INFERNO ENERGY",
    html: htmlPoruka,
    tekst,
  });
  if (g) return greska(g, 502);
  return NextResponse.json({ poslano: true });
}
