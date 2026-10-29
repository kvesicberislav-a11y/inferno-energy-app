// Slanje obavijesti na mobitel (Web Push) – zajedničko za poruke (/api/poruke) i dnevno održavanje.
// Samo za poslužitelj: tajni ključ prima kao argument, sam ga ne čita.
import { encryptNotification } from "@block65/webcrypto-web-push";

/** Poznate usluge za obavijesti (Google/Android, Apple, Mozilla, Microsoft) – nikamo drugamo ne šaljemo. */
export const POZNATE_USLUGE =
  /^https:\/\/(fcm\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

export type Uredjaj = { endpoint: string; p256dh: string; auth: string };
export type SadrzajObavijesti = { title: string; body: string; url: string; tag: string };
export type Posiljatelj = { kljuc: CryptoKey; javni: string; kontakt: string };

function izBase64Url(tekst: string) {
  const b64 = (tekst + "=".repeat((4 - (tekst.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (z) => z.charCodeAt(0));
}

function uBase64Url(bajtovi: Uint8Array) {
  return btoa(String.fromCharCode(...bajtovi)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function skrati(tekst: string, duljina: number) {
  const t = tekst.replace(/\s+/g, " ").trim();
  return t.length > duljina ? `${t.slice(0, duljina - 1)}…` : t;
}

/** Ključevi pošiljatelja iz tajne VAPID_PRIVATE_JWK (JSON s x, y, d) – javni se izračuna iz x i y. */
export async function posiljatelj(tajna: string | undefined, kontakt: string): Promise<Posiljatelj | null> {
  try {
    const jwk = JSON.parse(tajna ?? "") as { x?: string; y?: string; d?: string };
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

/**
 * Šalje jednu obavijest na jedan uređaj (šifriranje RFC 8291, aes128gcm – Android, iPhone, računalo).
 * Vraća HTTP status usluge za obavijesti (201 = poslano; 404/410 = uređaj više ne postoji).
 */
export async function posaljiPush(p: Posiljatelj, uredjaj: Uredjaj, sadrzaj: SadrzajObavijesti): Promise<number> {
  if (!POZNATE_USLUGE.test(uredjaj.endpoint)) return 400;
  const tijelo = await encryptNotification(
    { endpoint: uredjaj.endpoint, expirationTime: null, keys: { p256dh: uredjaj.p256dh, auth: uredjaj.auth } },
    new TextEncoder().encode(
      JSON.stringify({
        title: skrati(sadrzaj.title, 60),
        body: skrati(sadrzaj.body, 180),
        url: sadrzaj.url,
        tag: sadrzaj.tag,
      }),
    ),
  );
  const odgovor = await fetch(uredjaj.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidZaglavlje(p, uredjaj.endpoint),
      // 12 sati: ako je mobitel isključen, obavijest stigne kad se upali
      ttl: String(12 * 60 * 60),
      urgency: "high",
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
    },
    body: tijelo,
  });
  return odgovor.status;
}
