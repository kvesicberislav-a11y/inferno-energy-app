# Održavanje aplikacije INFERNO ENERGY (tehničke upute)

Za osobu (ili Claudea) koja održava aplikaciju. Plan održavanja za vlasnika je zaseban dokument.

## Gdje što radi

| Dio | Usluga | Besplatno ograničenje |
|---|---|---|
| Aplikacija (stranice + API) | Cloudflare Workers `inferno-energy-app` | 100 000 zahtjeva/dan, 10 ms CPU po zahtjevu, 50 vanjskih poziva po zahtjevu |
| Baza, prijava, slike | Supabase projekt `ifqoqzcsdwnkezvfuobv` (eu-west-1) | 500 MB baza, 1 GB datoteke, 5 GB prometa/mj., pauza nakon 7 dana mirovanja |
| Sigurnosne kopije | Cloudflare KV `inferno-kopije` (`10a195615806466080fa9b0effcc07c6`) | 1 GB, 1000 upisa/dan |
| Kod | GitHub `kvesicberislav-a11y/inferno-energy-app` (privatno) | – |

Tajne (nikad u kodu): Cloudflare tajne `SUPABASE_SECRET_KEY`, `VAPID_PRIVATE_JWK`, `ODRZAVANJE_KLJUC`.
Lokalna kopija ključa održavanja: `%USERPROFILE%\.inferno-energy\odrzavanje-kljuc.txt`.

## Automatski, svaki dan u 02:15 UTC (`worker.mjs` → `src/odrzavanje/odrzavanje.ts`)

1. Provjera baze (`stanje_sustava()`), što je ujedno drži budnom.
2. Kopija svih 20 tablica (JSON, `kopija/<datum>/<tablica>.json`) i popisa korisnika (`auth_korisnici.json`).
   - Dnevne kopije čuvaju se 14 dana, a nedjeljne 63 dana.
   - Sažetak je u `kopija/<datum>/_sazetak.json`, a zadnja uspješna u `stanje/zadnja_uspjesna_kopija`.
3. Upozorenje ako je baza iznad 400 MB ili su datoteke iznad 800 MB.
4. Ako nešto ne valja, stiže obavijest trenerima na mobitel. Za to se koriste zadnji poznati uređaji trenera iz KV-a, pa obavijest stiže i kad baza ne radi.

Ručno pokretanje i izvještaj:

```powershell
$k = (Get-Content "$env:USERPROFILE\.inferno-energy\odrzavanje-kljuc.txt").Trim()
Invoke-RestMethod -Method Post -Uri "https://inferno-energy-app.kvesic-berislav.workers.dev/__odrzavanje?kopija=1" -Headers @{ Authorization = "Bearer $k" } -UserAgent "inferno-rucno"
```

Parametri: `kopija=0` znači bez kopije, `obavijest=1` znači pošalji upozorenje ako nešto ne valja.
Zadnji izvještaj je u KV ključu `stanje/zadnje`:

```bash
npx wrangler kv key get stanje/zadnje --namespace-id 10a195615806466080fa9b0effcc07c6 --remote --text
```

## Povrat podataka iz kopije

1. Popis dostupnih kopija:
   ```bash
   npx wrangler kv key list --namespace-id 10a195615806466080fa9b0effcc07c6 --prefix kopija/ --remote
   ```
2. Najprije provjera, koja vraća u privremene tablice i uspoređuje broj redova:
   ```bash
   node scripts/vrati-kopiju.mjs 2026-10-29 --provjera
   ```
3. Zatim pravi povrat. Postojeći redovi se ne diraju, a vraćaju se samo oni koji nedostaju. Može i samo za neke tablice:
   ```bash
   node scripts/vrati-kopiju.mjs 2026-10-29 --tablice obroci,mjerenja
   ```
   Skripta ispiše naredbu `supabase db query … -f <datoteka>`. Pokreni je, pa obriši datoteku, jer sadrži osobne podatke.
4. Ako nedostaju i korisnici (`auth.users`), na primjer nakon novog Supabase projekta:
   - Vrati ih prije tablica, preko Supabase admin API-ja `createUser`, iz `auth_korisnici.json`, s istim `id` i e-mailom. `profili` nastaju sami preko okidača.
   - Lozinke se ne mogu vratiti. Svima se šalje link za novu lozinku (trener → klijent → „Nova lozinka”).
5. Slike napretka nisu u kopiji. Supabase Storage je trajna pohrana, a klijent može dodati novi set.

## Promjene baze

SQL datoteke `supabase/01…13_*.sql` pokreću se redom (na novom projektu sve, na postojećem samo nove):

```bash
npx supabase@2.122.0 db query --linked --project-ref ifqoqzcsdwnkezvfuobv -f supabase/NN_naziv.sql
```

- Pokreće se iz `%TEMP%`.
- Nakon svake promjene ponovno pokreni sigurnosne testove (RLS) iz `supabase/testovi/`, svaki istom naredbom (`-f supabase/testovi/rls-test-….sql`). Svi moraju dati OK.
  - Testovi upisuju probne redove pa ih na kraju brišu.
  - `rls-test-pozivnica-trener.sql` i `rls-test-programi.sql` sve ponište i rezultat jave kao grešku `REZULTAT:…`.
- Supabase savjetnik:
  ```bash
  npx supabase@2.122.0 db advisors --linked --project-ref ifqoqzcsdwnkezvfuobv --type all --level info
  ```
- Očekivana i namjerna upozorenja:
  - `authenticated_security_definer_function_executable`: funkcije same provjeravaju tko ih zove.
  - `rls_enabled_no_policy` na `push_pretplate`.
  - `auth_otp_long_expiry`: link za novu lozinku namjerno vrijedi 24 h.
  - `auth_leaked_password_protection` je samo na plaćenom planu.

## Objava

```powershell
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy   # puni i predmemoriju stranica (cdn-cgi/_next_cache)
```

- Uz to, svaki push na `main` pokreće Cloudflare Workers Builds.
- Prije objave obriši `.next`, jer stari tipovi u `.next/dev` ruše build.
- Provjere:
  - `npx tsc --noEmit`
  - `npm run lint`
  - lokalno: `npx wrangler dev --test-scheduled`, zatim `/__scheduled` pokreće održavanje
- Vraćanje na prethodnu verziju: `npx wrangler rollback` (popis verzija daje `npx wrangler deployments list`).

## Redovite provjere (vidi plan održavanja)

**Mjesečno, automatski:** zakazani zadatak u Claude aplikaciji na Berislavovom računalu, 1. u mjesecu u 10:00.
- Ako je aplikacija tada zatvorena, zadatak se pokreće pri sljedećem otvaranju.
- Zadatak pokreće skriptu koja samo čita:
  ```bash
  node scripts/mjesecna-provjera.mjs
  ```
- Skripta provjerava:
  - dnevnu provjeru i kopije (`stanje/zadnje`) te zauzeće prema ograničenjima;
  - stranice, sigurnosna zaglavlja i zaštitu API-ja uživo;
  - Cloudflare za zadnjih 30 dana: neuspjele zahtjeve, greške 1102 i najveći dnevni promet;
  - `npm audit` i `npm outdated`;
  - Supabase savjetnik, javlja samo nova upozorenja.
- U siječnju, travnju, srpnju i listopadu napravi i probni povrat u privremene tablice.
- Izlazni kod 0 znači da je sve u redu, a 2 da ima stvari za pogledati.
- Poznata i namjerna upozorenja popisana su na vrhu skripte.

**Tromjesečno, ručno:**
- Ažuriranje paketa (samo verzije starije od 2 tjedna; build, lint i test prije objave).

**Godišnje:**
- Rast baze i slika u odnosu na ograničenja.
- Treba li prijeći na Supabase Pro (25 $/mj.: dnevne kopije, bez pauze, 8 GB baze).
