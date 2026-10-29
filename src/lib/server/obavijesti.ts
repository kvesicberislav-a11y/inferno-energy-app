import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { posaljiPush, posiljatelj, POZNATE_USLUGE, type Uredjaj } from "@/lib/push";

/** Najviše uređaja po korisniku i slanja po jednom zahtjevu (Cloudflare besplatni plan dopušta 50 vanjskih poziva). */
const UREDJAJA_PO_KORISNIKU = 3;
export const NAJVISE_SLANJA = 30;

export type Obavijest = {
  naslov: string;
  tekst: string;
  /** stranica koja se otvori kad se dodirne obavijest (npr. "/klijent/poruke") */
  url: string;
  /** obavijesti s istom oznakom zamjenjuju jedna drugu umjesto da se gomilaju */
  oznaka: string;
};

export function obavijestiPodesene() {
  return Boolean(process.env.VAPID_PRIVATE_JWK);
}

/**
 * Šalje obavijest na mobitel(e) zadanih korisnika.
 * @param kontakt adresa aplikacije (usluge za obavijesti traže kontakt pošiljatelja)
 * @returns broj uspješno poslanih obavijesti
 */
export async function posaljiObavijesti(
  admin: SupabaseClient,
  slanja: { korisnikId: string; obavijest: Obavijest }[],
  kontakt: string,
): Promise<number> {
  if (slanja.length === 0) return 0;
  const vapid = await posiljatelj(process.env.VAPID_PRIVATE_JWK, kontakt);
  if (!vapid) return 0;

  const korisnici = [...new Set(slanja.map((s) => s.korisnikId))];
  const { data } = await admin
    .from("push_pretplate")
    .select("korisnik_id, endpoint, p256dh, auth")
    .in("korisnik_id", korisnici)
    .order("kreirano", { ascending: false });

  const uredjaji = new Map<string, Uredjaj[]>();
  for (const r of data ?? []) {
    const id = String(r.korisnik_id);
    const popis = uredjaji.get(id) ?? [];
    if (popis.length < UREDJAJA_PO_KORISNIKU && POZNATE_USLUGE.test(String(r.endpoint))) {
      popis.push({ endpoint: String(r.endpoint), p256dh: String(r.p256dh), auth: String(r.auth) });
    }
    uredjaji.set(id, popis);
  }

  const posao = slanja
    .flatMap((s) => (uredjaji.get(s.korisnikId) ?? []).map((u) => ({ uredjaj: u, obavijest: s.obavijest })))
    .slice(0, NAJVISE_SLANJA);

  const zastarjeli: string[] = [];
  const rezultati = await Promise.allSettled(
    posao.map(async ({ uredjaj, obavijest }) => {
      const status = await posaljiPush(vapid, uredjaj, {
        title: obavijest.naslov,
        body: obavijest.tekst,
        url: obavijest.url,
        tag: obavijest.oznaka,
      });
      // 404/410 = korisnik je ugasio obavijesti ili obrisao aplikaciju → taj uređaj više ne koristimo
      if (status === 404 || status === 410) zastarjeli.push(uredjaj.endpoint);
      return status >= 200 && status < 300;
    }),
  );

  if (zastarjeli.length) {
    await admin.from("push_pretplate").delete().in("endpoint", zastarjeli);
  }
  return rezultati.filter((r) => r.status === "fulfilled" && r.value).length;
}

/** Poruke u jednom zahtjevu za obavijesti (svaka ide na najviše 3 uređaja → najviše 30 slanja). */
export const PORUKA_PO_OBAVIJESTI = 10;

/**
 * Šalje obavijesti za nove poruke (svaka poruka samo jednom, i samo autoru u prvih 15 minuta).
 * Poruka trenera → klijentu. Poruka klijenta → treneru.
 */
export async function obavijestiZaPoruke(
  admin: SupabaseClient,
  ids: string[],
  autorId: string,
  kontakt: string,
): Promise<number> {
  if (!obavijestiPodesene() || ids.length === 0) return 0;
  const prije = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: poruke } = await admin
    .from("poruke")
    .update({ obavijesteno: true })
    .in("id", ids.slice(0, PORUKA_PO_OBAVIJESTI))
    .eq("autor_id", autorId)
    .eq("obavijesteno", false)
    .gte("kreirano", prije)
    .select("klijent_id, od_trenera, tekst");
  if (!poruke?.length) return 0;

  const slanja: { korisnikId: string; obavijest: Obavijest }[] = [];
  for (const p of poruke.filter((p) => p.od_trenera)) {
    slanja.push({
      korisnikId: String(p.klijent_id),
      obavijest: { naslov: "Nova poruka od trenera", tekst: String(p.tekst), url: "/klijent/poruke", oznaka: "poruke" },
    });
  }

  const odKlijenata = poruke.filter((p) => !p.od_trenera);
  if (odKlijenata.length) {
    const klijentIds = [...new Set(odKlijenata.map((p) => String(p.klijent_id)))];
    const { data: profili } = await admin
      .from("profili")
      .select("id, ime, email, uloga, aktivan")
      .or(`uloga.eq.trener,id.in.(${klijentIds.join(",")})`);
    const treneri = (profili ?? []).filter((p) => p.uloga === "trener" && p.aktivan).map((p) => String(p.id));
    const imena = new Map((profili ?? []).map((p) => [String(p.id), String(p.ime || p.email || "Klijent")]));
    for (const p of odKlijenata) {
      const klijentId = String(p.klijent_id);
      for (const trenerId of treneri) {
        slanja.push({
          korisnikId: trenerId,
          obavijest: {
            naslov: imena.get(klijentId) ?? "Klijent",
            tekst: String(p.tekst),
            url: `/trener/poruke?id=${klijentId}`,
            oznaka: `poruke-${klijentId}`,
          },
        });
      }
    }
  }

  return posaljiObavijesti(admin, slanja, kontakt);
}
