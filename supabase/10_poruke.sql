-- =====================================================================
-- PORUKE: dopisivanje trenera i klijenta + obavijesti na mobitel (push)
-- =====================================================================

-- ---------------------------------------------------------------------
-- PORUKE. Svaki klijent ima jedan razgovor s trenerom (klijent_id).
-- Poruka trenera skupini (svi / uživo / online) upisuje se u razgovor
-- svakog klijenta iz te skupine.
-- ---------------------------------------------------------------------
create table public.poruke (
  id            uuid primary key default gen_random_uuid(),
  klijent_id    uuid not null references public.profili (id) on delete cascade,
  autor_id      uuid references public.profili (id) on delete set null,
  od_trenera    boolean not null,
  tekst         text not null check (char_length(tekst) between 1 and 2000),
  procitano     timestamptz,
  -- je li poslužitelj već poslao obavijest na mobitel (šalje se samo jednom)
  obavijesteno  boolean not null default false,
  kreirano      timestamptz not null default now()
);

create index poruke_razgovor on public.poruke (klijent_id, kreirano desc);
create index poruke_neprocitane on public.poruke (klijent_id, od_trenera) where procitano is null;

alter table public.poruke enable row level security;

-- Čitanje: klijent samo svoj razgovor, trener sve razgovore.
-- Pisanje ide samo preko poslužitelja (/api/poruke), koji odmah šalje i obavijest.
create policy "poruke_citanje" on public.poruke for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));

-- Nove poruke stižu u aplikaciju odmah, bez osvježavanja (Supabase Realtime).
alter publication supabase_realtime add table public.poruke;

-- Primatelj označava poruke pročitanima (klijent poruke trenera, trener poruke klijenta).
create or replace function public.oznaci_procitano(p_klijent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_klijent = auth.uid() then
    update public.poruke set procitano = now()
     where klijent_id = p_klijent and od_trenera and procitano is null;
  elsif public.je_trener() then
    update public.poruke set procitano = now()
     where klijent_id = p_klijent and not od_trenera and procitano is null;
  end if;
end;
$$;

revoke execute on function public.oznaci_procitano(uuid) from public, anon;
grant execute on function public.oznaci_procitano(uuid) to authenticated;

-- Popis razgovora za trenera: svaki klijent, zadnja poruka i broj nepročitanih.
-- Izvršava se kao korisnik (security invoker) – klijent bi vidio samo sebe.
create or replace function public.razgovori()
returns table (
  klijent_id         uuid,
  ime                text,
  email              text,
  nacin              text,
  zadnja_poruka      text,
  zadnja_od_trenera  boolean,
  zadnje_vrijeme     timestamptz,
  neprocitano        integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.ime,
    p.email,
    p.nacin,
    z.tekst,
    z.od_trenera,
    z.kreirano,
    (select count(*)::integer from public.poruke n
      where n.klijent_id = p.id and not n.od_trenera and n.procitano is null)
  from public.profili p
  left join lateral (
    select x.tekst, x.od_trenera, x.kreirano from public.poruke x
     where x.klijent_id = p.id
     order by x.kreirano desc
     limit 1
  ) z on true
  where p.uloga = 'klijent'
  order by z.kreirano desc nulls last, p.ime;
$$;

revoke execute on function public.razgovori() from public, anon;
grant execute on function public.razgovori() to authenticated;

-- ---------------------------------------------------------------------
-- PRETPLATE ZA OBAVIJESTI: jedan red po uređaju (mobitel/preglednik).
-- Izravan pristup nema nitko – samo funkcije ispod i poslužitelj.
-- ---------------------------------------------------------------------
create table public.push_pretplate (
  id           uuid primary key default gen_random_uuid(),
  korisnik_id  uuid not null references public.profili (id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) between 1 and 1000),
  p256dh       text not null check (char_length(p256dh) between 1 and 200),
  auth         text not null check (char_length(auth) between 1 and 100),
  kreirano     timestamptz not null default now()
);

create index push_pretplate_korisnik on public.push_pretplate (korisnik_id, kreirano desc);

alter table public.push_pretplate enable row level security;

-- Uređaj prijavljenog korisnika prima obavijesti. Ako je isti mobitel prije
-- bio prijavljen kao netko drugi, obavijesti od sad idu novom korisniku.
create or replace function public.spremi_pretplatu(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Nisi prijavljen.';
  end if;
  -- samo poznate usluge za obavijesti (Google/Android, Apple, Mozilla, Microsoft)
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'Nepoznata usluga za obavijesti.';
  end if;
  insert into public.push_pretplate (korisnik_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set korisnik_id = excluded.korisnik_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        kreirano = now();
  -- najviše 5 uređaja po korisniku (najstariji se brišu)
  delete from public.push_pretplate
   where korisnik_id = auth.uid()
     and id not in (
       select id from public.push_pretplate
        where korisnik_id = auth.uid()
        order by kreirano desc
        limit 5
     );
end;
$$;

revoke execute on function public.spremi_pretplatu(text, text, text) from public, anon;
grant execute on function public.spremi_pretplatu(text, text, text) to authenticated;

-- Odjava s uređaja: taj uređaj više ne prima obavijesti.
create or replace function public.obrisi_pretplatu(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_pretplate where endpoint = p_endpoint and korisnik_id = auth.uid();
$$;

revoke execute on function public.obrisi_pretplatu(text) from public, anon;
grant execute on function public.obrisi_pretplatu(text) to authenticated;
