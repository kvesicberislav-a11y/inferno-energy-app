// Ulaz za Cloudflare Worker:
// - sve stranice i API rute → Next.js aplikacija (OpenNext, .open-next/worker.js nastaje pri buildu)
// - svaki dan (cron u wrangler.jsonc) → dnevno održavanje: provjera baze, sigurnosna kopija, upozorenja
// - POST /__odrzavanje s tajnim ključem (ODRZAVANJE_KLJUC) → ručno pokretanje istog posla
import { default as aplikacija } from "./.open-next/worker.js";
import { dnevnoOdrzavanje } from "./src/odrzavanje/odrzavanje.ts";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

/** Usporedba bez otkrivanja duljine/sadržaja kroz vrijeme izvođenja. */
function jednako(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let razlika = 0;
  for (let i = 0; i < a.length; i++) razlika |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return razlika === 0;
}

// Prava adresa aplikacije. Stara workers.dev adresa i www preusmjeravaju ovamo
// (testna adresa test-inferno-energy-app….workers.dev se NE preusmjerava).
const GLAVNA_ADRESA = "infernoenergy.hr";
// PRIVREMENO bez stare workers.dev adrese: Kuhadini DNS zapisi (TTL 24 h) kod nekih operatera još vode
// infernoenergy.hr na stari server. Vratiti "inferno-energy-app.kvesic-berislav.workers.dev" u popis nakon 4. 11. 2026.
const PREUSMJERI = new Set(["www.infernoenergy.hr"]);

/**
 * Stranice (HTML i podaci za prelazak između stranica): preglednik prije svakog otvaranja pita
 * ima li nova verzija. OpenNext šalje "s-maxage, stale-while-revalidate=30 dana", pa je preglednik
 * nakon objave prvi put pokazivao staru spremljenu verziju (npr. bez novih gumba).
 * JS/CSS datoteke (/_next/static, imena s otiskom sadržaja) i dalje se spremaju trajno.
 */
function svjezaStranica(odgovor) {
  const vrsta = odgovor.headers.get("content-type") || "";
  if (!vrsta.includes("text/html") && !vrsta.includes("text/x-component")) return odgovor;
  const novi = new Response(odgovor.body, odgovor);
  novi.headers.set("Cache-Control", "no-cache");
  return novi;
}

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // samo otvaranje stranica (GET/HEAD); slanje podataka sa stare adrese i dalje radi
    if (
      PREUSMJERI.has(url.hostname) &&
      (request.method === "GET" || request.method === "HEAD") &&
      url.pathname !== "/__odrzavanje"
    ) {
      url.protocol = "https:";
      url.hostname = GLAVNA_ADRESA;
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/__odrzavanje") {
      const dobiveni = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (request.method !== "POST" || !env.ODRZAVANJE_KLJUC || !jednako(dobiveni, env.ODRZAVANJE_KLJUC)) {
        return new Response("Not Found", { status: 404 });
      }
      const izvjestaj = await dnevnoOdrzavanje(env, {
        kopija: url.searchParams.get("kopija") !== "0",
        obavijest: url.searchParams.get("obavijest") === "1",
      });
      return Response.json(izvjestaj, { headers: { "Cache-Control": "no-store" } });
    }
    return svjezaStranica(await aplikacija.fetch(request, env, ctx));
  },

  async scheduled(_dogadaj, env, ctx) {
    ctx.waitUntil(dnevnoOdrzavanje(env, { kopija: true, obavijest: true }));
  },
};

export default worker;
