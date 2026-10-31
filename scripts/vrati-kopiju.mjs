// Povrat podataka iz dnevne sigurnosne kopije (Cloudflare KV → Supabase).
//
// Pokretanje (iz mape projekta):
//   node scripts/vrati-kopiju.mjs 2026-10-29 --provjera   → samo provjera: vraća u privremene tablice i broji redove
//   node scripts/vrati-kopiju.mjs 2026-10-29              → pravi povrat u bazu (postojeći redovi se ne diraju)
//   node scripts/vrati-kopiju.mjs 2026-10-29 --tablice obroci,mjerenja
//
// Skripta samo PRIPREMI SQL datoteku i ispiše kako je pokrenuti – ništa ne mijenja sama.
// Popis korisnika (auth_korisnici.json) vraća se zasebno – vidi ODRZAVANJE.md.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const KV_ID = "10a195615806466080fa9b0effcc07c6";
const REDOVA_PO_DIJELU = 20_000;
// redoslijed poštuje veze među tablicama (isti kao u src/odrzavanje/odrzavanje.ts)
const TABLICE = [
  "profili", "pozivnice", "pripremljeni_podaci", "ciljevi_makroa", "obroci", "namirnice", "vjezbe", "bazne_vjezbe", "pracene_vjezbe", "planovi", "plan_dani",
  "plan_vjezbe", "dodjele_planova", "treninzi", "trening_vjezbe", "odradjene_serije", "zamjene_vjezbi", "mjerenja",
  "slike_napretka", "biljeske_trenera", "termini_pravila", "termini_iznimke", "termini_dodatni", "poruke",
];

const [datum, ...ostalo] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(datum ?? "")) {
  console.error("Upotreba: node scripts/vrati-kopiju.mjs <YYYY-MM-DD> [--provjera] [--tablice a,b]");
  process.exit(1);
}
const provjera = ostalo.includes("--provjera");
const i = ostalo.indexOf("--tablice");
const odabrane = i >= 0 ? ostalo[i + 1].split(",") : TABLICE;

// wrangler se pokreće izravno kroz node (bez ljuske)
const WRANGLER = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

function kvGet(kljuc) {
  return execFileSync(
    process.execPath,
    [WRANGLER, "kv", "key", "get", kljuc, "--namespace-id", KV_ID, "--remote", "--text"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  );
}

const sazetak = JSON.parse(kvGet(`kopija/${datum}/_sazetak.json`));
const redova = sazetak.kopija?.redova ?? {};
const tag = "$povrat$";
let sql = `-- Povrat iz kopije ${datum} (${provjera ? "PROVJERA u privremene tablice" : "POVRAT u bazu"})\n`;
const ocekivano = [];

for (const t of TABLICE.filter((x) => odabrane.includes(x))) {
  const n = redova[t];
  if (n === undefined || n < 0) {
    console.warn(`! ${t}: nema u kopiji`);
    continue;
  }
  ocekivano.push([t, n]);
  const cilj = provjera ? `provjera_${t}` : `public.${t}`;
  if (provjera) sql += `create temp table if not exists provjera_${t} (like public.${t});\n`;
  const dijelova = Math.max(1, Math.ceil(n / REDOVA_PO_DIJELU));
  for (let d = 0; d < dijelova; d++) {
    const json = kvGet(`kopija/${datum}/${t}${d ? `.${d}` : ""}.json`).trim();
    if (json.includes(tag)) throw new Error(`Kopija ${t} sadrži oznaku ${tag}`);
    sql += `do ${tag}
declare kol text;
begin
  select string_agg(quote_ident(attname), ',' order by attnum) into kol
    from pg_attribute
   where attrelid = '${cilj}'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  execute format('insert into ${cilj} (%1$s) select %1$s from json_populate_recordset(null::${cilj}, $1) on conflict do nothing', kol)
    using ${"'" + json.replace(/'/g, "''") + "'"}::json;
end ${tag};\n`;
  }
  console.log(`✓ ${t}: ${n} redova`);
}

if (provjera) {
  sql += `select * from (values ${ocekivano
    .map(([t, n]) => `('${t}', ${n}, (select count(*) from provjera_${t}))`)
    .join(", ")}) as v(tablica, u_kopiji, vraceno);\n`;
}

const izlaz = join(tmpdir(), `inferno-povrat-${datum}${provjera ? "-provjera" : ""}.sql`);
writeFileSync(izlaz, sql, "utf8");
console.log(`\nSQL je spreman: ${izlaz}`);
console.log(
  `Pokreni (iz %TEMP%): npx supabase@2.122.0 db query --linked --project-ref ifqoqzcsdwnkezvfuobv -f "${izlaz}"`,
);
console.log("Nakon pokretanja obriši datoteku – sadrži osobne podatke.");
