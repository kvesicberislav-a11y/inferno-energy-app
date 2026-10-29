// Mjesečna provjera aplikacije – SAMO ČITA, ništa ne mijenja.
//
// Pokretanje (iz mape projekta):
//   node scripts/mjesecna-provjera.mjs              → provjera (u siječnju, travnju, srpnju i listopadu i probni povrat)
//   node scripts/mjesecna-provjera.mjs --povrat     → uvijek napravi i probni povrat iz kopije
//   node scripts/mjesecna-provjera.mjs --bez-povrata
//
// Ispiše izvještaj. Izlazni kod: 0 = sve u redu, 2 = ima stvari za pogledati.
// Treba: prijavljen wrangler (npx wrangler login) i povezan Supabase CLI (isti kao za ostalo održavanje).
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ADRESA = "https://inferno-energy-app.kvesic-berislav.workers.dev";
const KV_ID = "10a195615806466080fa9b0effcc07c6";
const SUPABASE = ["--yes", "supabase@2.122.0"];
const PROJEKT = ["--linked", "--project-ref", "ifqoqzcsdwnkezvfuobv"];
const WORKER = "inferno-energy-app";
const OGRANICENJA = { bazaMb: 500, datotekeMb: 1024, zahtjevaDnevno: 100_000 };
const PRAG = 0.7; // od 70 % ograničenja javlja se kao stvar za pogledati

// Upozorenja Supabase savjetnika koja su namjerna (vidi ODRZAVANJE.md).
const OCEKIVANI_SAVJETI = new Set([
  "authenticated_security_definer_function_executable", // funkcije same provjeravaju tko ih zove
  "auth_otp_long_expiry", // link za novu lozinku namjerno vrijedi 24 h
  "auth_leaked_password_protection", // samo na plaćenom planu
  "unused_index", // indeksi za veze među tablicama; s malo korisnika se još ne koriste
  "rls_enabled_no_policy:push_pretplate", // tablici pristupa samo poslužitelj
  "anon_security_definer_function_executable:provjeri_pozivnicu", // stranica za registraciju provjerava pozivnicu prije prijave
]);

// Poznate ranjivosti paketa koje ne utječu na aplikaciju.
const POZNATE_RANJIVOSTI = new Map([
  ["glob CLI: Command injection via -c/--cmd executes matches with shell:true",
    "samo u alatu za izradu (OpenNext → @node-minify); glob se ne pokreće iz naredbenog retka"],
]);

const MAPA = fileURLToPath(new URL("..", import.meta.url));
const WRANGLER = join(MAPA, "node_modules", "wrangler", "bin", "wrangler.js");
const NPM = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const NPX = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");

const zaPogledati = [];
const linije = [];
const ispis = (t = "") => linije.push(t);
const ok = (t) => ispis(`  ✓ ${t}`);
const info = (t) => ispis(`  · ${t}`);
const problem = (t) => {
  ispis(`  ! ${t}`);
  zaPogledati.push(t);
};

function pokreni(datoteka, argumenti, opcije = {}) {
  try {
    return execFileSync(process.execPath, [datoteka, ...argumenti], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      cwd: MAPA,
      ...opcije,
    });
  } catch (e) {
    // npm audit / npm outdated završavaju s kodom 1 kad nešto nađu – izlaz je i dalje ispravan
    if (opcije.prihvatiGresku && e.stdout) return e.stdout;
    throw new Error(`${argumenti.slice(0, 3).join(" ")} nije uspjelo (kod ${e.status ?? "?"})`);
  }
}
const kv = (...a) => pokreni(WRANGLER, ["kv", "key", ...a, "--namespace-id", KV_ID, "--remote"]);
const supabase = (...a) =>
  JSON.parse(pokreni(NPX, [...SUPABASE, ...a, ...PROJEKT, "--output-format", "json"], { cwd: tmpdir() }));
const satiOd = (iso) => (Date.now() - new Date(iso).getTime()) / 36e5;
const posto = (dio, cijelo) => Math.round((dio / cijelo) * 100);

async function odjeljak(naslov, fn) {
  ispis();
  ispis(naslov);
  try {
    await fn();
  } catch (e) {
    problem(`provjera nije uspjela: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
let zadnjaKopija = null;

await odjeljak("1. Dnevna provjera i sigurnosne kopije", async () => {
  const zadnje = JSON.parse(kv("get", "stanje/zadnje", "--text"));
  const sati = satiOd(zadnje.vrijeme);
  if (sati > 30) problem(`dnevna provjera nije radila ${Math.round(sati)} h (zadnja ${zadnje.vrijeme})`);
  else if (!zadnje.ok) problem(`zadnja dnevna provjera (${zadnje.vrijeme}) javila je problem: ${[...zadnje.greske, ...zadnje.upozorenja].join("; ")}`);
  else ok(`zadnja dnevna provjera ${zadnje.vrijeme.slice(0, 16).replace("T", " ")} UTC – u redu`);
  for (const u of zadnje.ok ? zadnje.upozorenja : []) problem(`upozorenje dnevne provjere: ${u}`);

  zadnjaKopija = kv("get", "stanje/zadnja_uspjesna_kopija", "--text").trim();
  const kljucevi = JSON.parse(kv("list", "--prefix", "kopija/"));
  const datumi = [...new Set(kljucevi.filter((k) => k.name.endsWith("/_sazetak.json")).map((k) => k.name.split("/")[1]))].sort();
  const daniOdKopije = (Date.now() - new Date(`${zadnjaKopija}T12:00:00Z`).getTime()) / 864e5;
  const opisKopija = `${datumi.length} spremljenih (${datumi[0] ?? "–"} … ${datumi.at(-1) ?? "–"})`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(zadnjaKopija) || daniOdKopije > 2.5)
    problem(`zadnja uspješna kopija je stara: ${zadnjaKopija || "nema je"}; kopija: ${opisKopija}`);
  else ok(`zadnja uspješna kopija ${zadnjaKopija}; kopija: ${opisKopija}`);

  const b = zadnje.baza ?? {};
  if (typeof b.mb === "number") {
    const p = posto(b.mb, OGRANICENJA.bazaMb);
    (p >= PRAG * 100 ? problem : ok)(`baza ${b.mb} MB od ${OGRANICENJA.bazaMb} MB (${p} %)`);
  }
  if (typeof b.datotekeMb === "number") {
    const p = posto(b.datotekeMb, OGRANICENJA.datotekeMb);
    (p >= PRAG * 100 ? problem : ok)(`slike ${b.datotekeMb} MB od ${OGRANICENJA.datotekeMb} MB (${p} %), ${b.brojDatoteka} datoteka`);
  }
  if (typeof b.klijenata === "number") info(`aktivnih klijenata: ${b.klijenata}`);
});

await odjeljak("2. Aplikacija uživo", async () => {
  const dohvati = (put, init) =>
    fetch(ADRESA + put, { redirect: "manual", ...init, headers: { "User-Agent": "inferno-mjesecna-provjera", ...init?.headers } });
  for (const put of ["/", "/prijava", "/sw.js", "/manifest.webmanifest"]) {
    const r = await dohvati(put);
    (r.status === 200 ? ok : problem)(`${put} → ${r.status}`);
    if (put === "/prijava") {
      const nedostaje = ["x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"].filter((h) => !r.headers.get(h));
      (nedostaje.length ? problem : ok)(nedostaje.length ? `nedostaju sigurnosna zaglavlja: ${nedostaje.join(", ")}` : "sigurnosna zaglavlja postoje");
    }
  }
  // ispravna poruka bez prijave – mora je odbiti provjera prijave (ništa se ne upisuje)
  const poruke = await dohvati("/api/poruke", {
    method: "POST",
    body: JSON.stringify({ tekst: "provjera", za: "svi" }),
    headers: { "Content-Type": "application/json" },
  });
  (poruke.status === 401 ? ok : problem)(`slanje poruke bez prijave → ${poruke.status} (treba 401)`);
  const odrz = await dohvati("/__odrzavanje", { method: "POST" });
  (odrz.status === 404 ? ok : problem)(`održavanje bez ključa → ${odrz.status} (treba 404)`);
});

await odjeljak("3. Cloudflare – zadnjih 30 dana", async () => {
  // wrangler je u koraku 1 osvježio prijavu; token se čita samo ovdje i nigdje ne ispisuje
  const cfg = readFileSync(join(process.env.APPDATA ?? "", "xdg.config", ".wrangler", "config", "default.toml"), "utf8");
  const token = /oauth_token\s*=\s*"([^"]+)"/.exec(cfg)?.[1];
  if (!token) throw new Error("wrangler nije prijavljen (npx wrangler login)");
  const zaglavlja = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const racuni = await (await fetch("https://api.cloudflare.com/client/v4/accounts", { headers: zaglavlja })).json();
  if (!racuni.success) throw new Error("prijava na Cloudflare je istekla (npx wrangler login)");
  const do_ = new Date();
  const od = new Date(do_.getTime() - 30 * 864e5);
  const upit = (dimenzija) => `query($a:String!,$f:Time!,$t:Time!){viewer{accounts(filter:{accountTag:$a}){
    workersInvocationsAdaptive(limit:1000, filter:{scriptName:"${WORKER}", datetime_geq:$f, datetime_leq:$t}){
      sum{requests errors} quantiles{cpuTimeP50 cpuTimeP99} dimensions{${dimenzija}}}}}}`;
  const graphql = async (dimenzija) => {
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: zaglavlja,
      body: JSON.stringify({ query: upit(dimenzija), variables: { a: racuni.result[0].id, f: od.toISOString(), t: do_.toISOString() } }),
    });
    const j = await r.json();
    if (j.errors?.length) throw new Error(j.errors[0].message);
    return j.data.viewer.accounts[0].workersInvocationsAdaptive;
  };

  const poStatusu = await graphql("status");
  const ukupno = poStatusu.reduce((s, x) => s + x.sum.requests, 0);
  const greske = poStatusu.filter((x) => x.dimensions.status !== "success");
  const brojGresaka = greske.reduce((s, x) => s + x.sum.requests, 0);
  const preopterecenje = greske.filter((x) => x.dimensions.status === "exceededResources").reduce((s, x) => s + x.sum.requests, 0);
  info(`zahtjeva: ${ukupno.toLocaleString("hr-HR")}`);
  if (preopterecenje > 0) problem(`${preopterecenje} zahtjeva prekinuto zbog prekoračenja CPU ograničenja (greška 1102)`);
  const opisGresaka = greske.map((x) => `${x.dimensions.status}: ${x.sum.requests}`).join(", ");
  if (ukupno && brojGresaka / ukupno > 0.01) problem(`previše neuspjelih zahtjeva: ${brojGresaka} od ${ukupno} (${opisGresaka})`);
  else ok(`neuspjelih zahtjeva: ${brojGresaka}${opisGresaka ? ` (${opisGresaka})` : ""}`);
  const uspjesni = poStatusu.find((x) => x.dimensions.status === "success");
  if (uspjesni) info(`CPU po zahtjevu: medijan ${(uspjesni.quantiles.cpuTimeP50 / 1000).toFixed(1)} ms, 99 % ispod ${(uspjesni.quantiles.cpuTimeP99 / 1000).toFixed(1)} ms`);

  const poDanu = await graphql("date");
  const najvise = poDanu.reduce((m, x) => (x.sum.requests > m.sum.requests ? x : m), { sum: { requests: 0 }, dimensions: { date: "–" } });
  const p = posto(najvise.sum.requests, OGRANICENJA.zahtjevaDnevno);
  (p >= PRAG * 100 ? problem : ok)(
    `najviše u jednom danu: ${najvise.sum.requests.toLocaleString("hr-HR")} zahtjeva (${najvise.dimensions.date}), ${p} % dnevnog ograničenja`,
  );
});

await odjeljak("4. Paketi (npm)", async () => {
  const audit = JSON.parse(pokreni(NPM, ["audit", "--json"], { prihvatiGresku: true }));
  const ranjivosti = audit.vulnerabilities ?? {};
  // naslovi stvarnih upozorenja do kojih vodi lanac ovisnosti
  const naslovi = (ime, vidjeno = new Set()) => {
    if (vidjeno.has(ime) || !ranjivosti[ime]) return [];
    vidjeno.add(ime);
    return ranjivosti[ime].via.flatMap((v) => (typeof v === "string" ? naslovi(v, vidjeno) : [v.title]));
  };
  const nepoznate = [];
  const poznate = new Set();
  for (const [ime, v] of Object.entries(ranjivosti)) {
    const t = [...new Set(naslovi(ime))];
    if (t.length && t.every((x) => POZNATE_RANJIVOSTI.has(x))) t.forEach((x) => poznate.add(x));
    else nepoznate.push(`${ime} (${v.severity}${v.fixAvailable ? ", postoji popravak" : ""}): ${t.join(" / ") || "?"}`);
  }
  if (nepoznate.length) problem(`nove sigurnosne ranjivosti paketa: ${nepoznate.join("; ")}`);
  else ok("nema novih sigurnosnih ranjivosti paketa");
  for (const x of poznate) info(`poznato i bezopasno: „${x}” – ${POZNATE_RANJIVOSTI.get(x)}`);

  const zastarjeli = JSON.parse(pokreni(NPM, ["outdated", "--json"], { prihvatiGresku: true }) || "{}");
  const popis = Object.entries(zastarjeli).map(([ime, v]) => `${ime} ${v.current} → ${v.latest}`);
  info(popis.length ? `novije verzije postoje za: ${popis.join(", ")}` : "svi paketi su na zadnjoj verziji");
});

await odjeljak("5. Supabase savjetnik (baza)", async () => {
  const { results = [] } = supabase("db", "advisors", "--type", "all", "--level", "info");
  const novi = results.filter((r) => !OCEKIVANI_SAVJETI.has(r.name) && !OCEKIVANI_SAVJETI.has(`${r.name}:${r.metadata?.name}`));
  if (novi.length) for (const r of novi) problem(`savjetnik (${r.level}): ${r.title} – ${r.detail.replace(/\\?`/g, "")}`);
  else ok(`nema novih upozorenja (${results.length} poznatih i namjernih)`);
});

const mjesec = new Date().getMonth(); // 0 = siječanj
const povrat = !process.argv.includes("--bez-povrata") && (process.argv.includes("--povrat") || mjesec % 3 === 0);
if (povrat) {
  await odjeljak("6. Probni povrat iz kopije (u privremene tablice)", async () => {
    if (!zadnjaKopija) throw new Error("nema podatka o zadnjoj kopiji");
    const datoteka = join(tmpdir(), `inferno-povrat-${zadnjaKopija}-provjera.sql`);
    try {
      pokreni(join(MAPA, "scripts", "vrati-kopiju.mjs"), [zadnjaKopija, "--provjera"]);
      const { rows = [] } = supabase("db", "query", "-f", datoteka);
      const krivo = rows.filter((r) => Number(r.u_kopiji) !== Number(r.vraceno));
      if (!rows.length) problem("probni povrat nije vratio rezultat");
      else if (krivo.length) problem(`probni povrat se ne poklapa: ${krivo.map((r) => `${r.tablica} ${r.vraceno}/${r.u_kopiji}`).join(", ")}`);
      else ok(`kopija ${zadnjaKopija}: svih ${rows.length} tablica vraćeno, ${rows.reduce((s, r) => s + Number(r.vraceno), 0)} redova se poklapa`);
    } finally {
      rmSync(datoteka, { force: true }); // sadrži osobne podatke
    }
  });
}

console.log(`MJESEČNA PROVJERA – INFERNO ENERGY (${new Date().toLocaleString("hr-HR", { timeZone: "Europe/Zagreb" })})`);
console.log(linije.join("\n"));
console.log();
if (zaPogledati.length) {
  console.log(`ZA POGLEDATI (${zaPogledati.length}):`);
  for (const t of zaPogledati) console.log(`  - ${t}`);
  process.exitCode = 2;
} else {
  console.log("SVE U REDU.");
}
