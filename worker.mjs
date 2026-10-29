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

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
    return aplikacija.fetch(request, env, ctx);
  },

  async scheduled(_dogadaj, env, ctx) {
    ctx.waitUntil(dnevnoOdrzavanje(env, { kopija: true, obavijest: true }));
  },
};

export default worker;
