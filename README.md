# INFERNO ENERGY – aplikacija za klijente

Web aplikacija (PWA) za praćenje prehrane, treninga i napretka klijenata.

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Supabase**: prijava, baza, zaštita podataka (Row Level Security)
- **Cloudflare Workers** (preko OpenNext): objava pri svakom pushu na GitHub

## Mape

- `src/app` – stranice (`/prijava`, `/pozivnica`, `/nova-lozinka`, `/trener`, `/klijent`) i API rute
- `src/components` – zajednički dijelovi sučelja
- `supabase/` – SQL skripte koje se pokreću u Supabase SQL Editoru, redom

## Tajne

Ključevi se NE spremaju u kod. Lokalno idu u `.env.local` (predložak: `.env.example`),
a za objavu u Cloudflare nadzornoj ploči.

## Naredbe

- `npm run dev` – lokalno pokretanje
- `npm run build` – provjera builda
- `npm run preview` – lokalni test u Cloudflare okruženju
