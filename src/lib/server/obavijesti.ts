import "server-only";
import { encryptNotification } from "@block65/webcrypto-web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Poznate usluge za obavijesti (Google/Android, Apple, Mozilla, Microsoft) – nikamo drugamo ne šaljemo. */
const POZNATE_USLUGE =
  /^https:\/\/(fcm\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

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

function izBase64Url(tekst: string) {
  const b64 = (tekst + "=".repeat((4 - (tekst.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (z) => z.charCodeAt(0));
}

function uBase64Url(bajtovi: Uint8Array) {
  return btoa(String.fromCharCode(...bajtovi)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Posiljatelj = { kljuc: CryptoKey; javni: string; kontakt: string };

/** Ključevi pošiljatelja iz tajne VAPID_PRIVATE_JWK (JSON s x, y, d) – javni se izračuna iz x i y. */
async function posiljatelj(tajna: string, kontakt: string): Promise<Posiljatelj | null> {
  try {
    const jwk = JSON.parse(tajna) as { x?: string; y?: string; d?: string };
    if (!jwk.x || !jwk.y || !jwk.d) return null;
    const javni = new Uint8Array(65);
    javni[0] = 4;
    javni.set(izBase64Url(jwk.x), 1);
    javni.set(izBase64Url(jwk.y), 33);
    const kljuc = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    return { kljuc, javni: uBase64Url(javni), kontakt };
  } catch {
    return null;
  }
}

/**
 * Potpis pošiljatelja (VAPID, RFC 8292). Namjerno bez "iat": Google odbija potpis
 * ako mu se to vrijeme čini i djelić sekunde u budućnosti.
 */
async function vapidZaglavlje(p: Posiljatelj, endpoint: string) {
  const kodiraj = (o: object) => uBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  const podaci = `${kodiraj({ typ: "JWT", alg: "ES256" })}.${kodiraj({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: p.kontakt,
  })}`;
  const potpis = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, p.kljuc, new TextEncoder().encode(podaci));
  return `vapid t=${podaci}.${uBase64Url(new Uint8Array(potpis))}, k=${p.javni}`;
}

function skrati(tekst: string, duljina: number) {
  const t = tekst.replace(/\s+/g, " ").trim();
  return t.length > duljina ? `${t.slice(0, duljina - 1)}…` : t;
}

/**
 * Šalje obavijest na mobitel(e) zadanih korisnika.
 * Šifriranje po standardu RFC 8291 (aes128gcm) – radi na Androidu, iPhoneu i računalu.
 * @param kontakt adresa aplikacije (usluge za obavijesti traže kontakt pošiljatelja)
 * @returns broj uspješno poslanih obavijesti
 */
export async function posaljiObavijesti(
  admin: SupabaseClient,
  slanja: { korisnikId: string; obavijest: Obavijest }[],
  kontakt: string,
): Promise<number> {
  if (slanja.length === 0) return 0;
  const vapid = await posiljatelj(process.env.VAPID_PRIVATE_JWK ?? "", kontakt);
  if (!vapid) return 0;

  const korisnici = [...new Set(slanja.map((s) => s.korisnikId))];
  const { data } = await admin
    .from("push_pretplate")
    .select("korisnik_id, endpoint, p256dh, auth")
    .in("korisnik_id", korisnici)
    .order("kreirano", { ascending: false });

  const uredjaji = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
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
      const sadrzaj = JSON.stringify({
        title: skrati(obavijest.naslov, 60),
        body: skrati(obavijest.tekst, 180),
        url: obavijest.url,
        tag: obavijest.oznaka,
      });
      const tijelo = await encryptNotification(
        { endpoint: uredjaj.endpoint, expirationTime: null, keys: { p256dh: uredjaj.p256dh, auth: uredjaj.auth } },
        new TextEncoder().encode(sadrzaj),
      );
      const odgovor = await fetch(uredjaj.endpoint, {
        method: "POST",
        headers: {
          authorization: await vapidZaglavlje(vapid, uredjaj.endpoint),
          // 12 sati: ako je mobitel isključen, obavijest stigne kad se upali
          ttl: String(12 * 60 * 60),
          urgency: "high",
          "content-encoding": "aes128gcm",
          "content-type": "application/octet-stream",
        },
        body: tijelo,
      });
      // 404/410 = korisnik je ugasio obavijesti ili obrisao aplikaciju → taj uređaj više ne koristimo
      if (odgovor.status === 404 || odgovor.status === 410) zastarjeli.push(uredjaj.endpoint);
      return odgovor.ok;
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
