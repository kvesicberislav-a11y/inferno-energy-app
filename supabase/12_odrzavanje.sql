-- =====================================================================
-- ODRŽAVANJE I POPRAVCI (pregled 29. 10. 2026.)
-- - pomoćne funkcije zaštite nisu dostupne neprijavljenima
-- - moze_dodati_slike ne otkriva podatke drugih klijenata
-- - indeksi za brže brisanje/povezivanje i pregled klijenata
-- - pregled jednog klijenta bez računanja svih ostalih
-- - stanje_sustava() za dnevno održavanje (samo poslužitelj)
-- - trener smije obrisati/zamijeniti sliku vježbe
-- - anonimni računi (ako se ikad uključe) ne dobivaju profil
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Neprijavljeni ne smiju pozivati pomoćne funkcije (koriste ih samo pravila za prijavljene)
-- ---------------------------------------------------------------------
revoke execute on function public.je_trener() from public, anon;
revoke execute on function public.ima_pristup_planu(uuid) from public, anon;
revoke execute on function public.ima_pristup_danu(uuid) from public, anon;
revoke execute on function public.ima_pristup_plan_vjezbi(uuid) from public, anon;
grant execute on function public.je_trener() to authenticated;
grant execute on function public.ima_pristup_planu(uuid) to authenticated;
grant execute on function public.ima_pristup_danu(uuid) to authenticated;
grant execute on function public.ima_pristup_plan_vjezbi(uuid) to authenticated;

-- 2) Smije li klijent danas dodati slike – odgovor samo za sebe (ili treneru)
create or replace function public.moze_dodati_slike(p_klijent uuid, p_datum date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_klijent = auth.uid() or public.je_trener())
     and not exists (
       select 1 from public.slike_napretka
       where klijent_id = p_klijent
         and datum <> p_datum
         and datum > p_datum - 14
     );
$$;

revoke execute on function public.moze_dodati_slike(uuid, date) from public, anon;
grant execute on function public.moze_dodati_slike(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Indeksi
-- ---------------------------------------------------------------------
create index if not exists poruke_autor_kreirano on public.poruke (autor_id, kreirano desc);
create index if not exists serije_klijent_kreirano on public.odradjene_serije (klijent_id, kreirano desc);
create index if not exists serije_plan_vjezba on public.odradjene_serije (plan_vjezba_id);
create index if not exists serije_vjezba on public.odradjene_serije (vjezba_id);
create index if not exists treninzi_plan_dan on public.treninzi (plan_dan_id);
create index if not exists plan_vjezbe_vjezba on public.plan_vjezbe (vjezba_id);
create index if not exists zamjene_plan_vjezba on public.zamjene_vjezbi (plan_vjezba_id);
create index if not exists zamjene_vjezba on public.zamjene_vjezbi (vjezba_id);
create index if not exists biljeske_autor on public.biljeske_trenera (autor);
create index if not exists ciljevi_postavio on public.ciljevi_makroa (postavio);
create index if not exists namirnice_dodao on public.namirnice (dodao);
create index if not exists pozivnice_iskoristio on public.pozivnice (iskoristio);
create index if not exists pozivnice_kreirao on public.pozivnice (kreirao);
-- (klijent_id, datum) već pokriva jedinstveni indeks treninzi_jedan_po_danu
drop index if exists public.treninzi_klijent_datum;

-- ---------------------------------------------------------------------
-- 4) Pregled klijenata: po želji samo jedan klijent (stranica klijenta)
-- ---------------------------------------------------------------------
drop function if exists public.pregled_klijenata();

create function public.pregled_klijenata(p_klijent uuid default null)
returns table (
  id                uuid,
  ime               text,
  email             text,
  kreirano          timestamptz,
  nacin             text,
  zadnja_aktivnost  timestamptz,
  zadnji_obrok      date,
  zadnji_trening    date,
  zadnja_tezina     numeric,
  datum_tezine      date,
  plan              text,
  kcal_danas        numeric,
  kcal_cilj         integer
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
    p.kreirano,
    p.nacin,
    greatest(
      (select max(o.kreirano) from public.obroci o where o.klijent_id = p.id),
      (select max(m.kreirano) from public.mjerenja m where m.klijent_id = p.id),
      (select max(s.kreirano) from public.odradjene_serije s where s.klijent_id = p.id),
      (select max(t.kreirano) from public.treninzi t where t.klijent_id = p.id),
      (select max(sl.kreirano) from public.slike_napretka sl where sl.klijent_id = p.id)
    ),
    (select max(o.datum) from public.obroci o where o.klijent_id = p.id),
    (select max(t.datum) from public.treninzi t where t.klijent_id = p.id),
    t.tezina_kg,
    t.datum,
    (select pl.naziv
       from public.dodjele_planova d
       join public.planovi pl on pl.id = d.plan_id
      where d.klijent_id = p.id and d.do_datuma is null
      limit 1),
    (select sum(o.kcal) from public.obroci o
      where o.klijent_id = p.id and o.datum = public.danas_zagreb()),
    (select c.kcal from public.ciljevi_makroa c
      where c.klijent_id = p.id and c.vrijedi_od <= public.danas_zagreb()
      order by c.vrijedi_od desc limit 1)
  from public.profili p
  left join lateral (
    select m.tezina_kg, m.datum from public.mjerenja m
     where m.klijent_id = p.id and m.tezina_kg is not null
     order by m.datum desc limit 1
  ) t on true
  where p.uloga = 'klijent'
    and (p_klijent is null or p.id = p_klijent)
  order by p.ime;
$$;

revoke execute on function public.pregled_klijenata(uuid) from public, anon;
grant execute on function public.pregled_klijenata(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Stanje sustava za dnevno održavanje (poziva ga samo poslužitelj tajnim ključem)
-- ---------------------------------------------------------------------
create or replace function public.stanje_sustava()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'baza_bajtova', pg_database_size(current_database()),
    'datoteke_bajtova', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o),
    'broj_datoteka', (select count(*) from storage.objects),
    'klijenata', (select count(*) from public.profili where uloga = 'klijent'),
    'uredjaji_trenera', (
      select coalesce(json_agg(json_build_object('endpoint', u.endpoint, 'p256dh', u.p256dh, 'auth', u.auth)), '[]'::json)
        from public.push_pretplate u
        join public.profili p on p.id = u.korisnik_id
       where p.uloga = 'trener' and p.aktivan
    )
  );
$$;

revoke execute on function public.stanje_sustava() from public, anon, authenticated;
grant execute on function public.stanje_sustava() to service_role;

-- ---------------------------------------------------------------------
-- 6) Slike vježbi: brisanje i zamjena traže pravo čitanja (javne adrese rade i bez ovoga)
-- ---------------------------------------------------------------------
drop policy if exists "vjezbe_slike_trener_citanje" on storage.objects;
create policy "vjezbe_slike_trener_citanje" on storage.objects for select to authenticated
  using (bucket_id = 'vjezbe' and (select public.je_trener()));

-- ---------------------------------------------------------------------
-- 7) Anonimni računi (prijava bez e-maila) ne dobivaju profil, pa ni pristup ničemu
-- ---------------------------------------------------------------------
create or replace function public.novi_korisnik()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.profili (id, email, ime)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'ime', '')
  );
  return new;
end;
$$;

revoke execute on function public.novi_korisnik() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8) Slike napretka: uz sliku smije se spremiti i njezina mala verzija (…_m.jpg) za popise
-- ---------------------------------------------------------------------
drop policy if exists "napredak_unos" on storage.objects;
create policy "napredak_unos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'napredak'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.slike_napretka s
      where s.klijent_id = (select auth.uid())
        and (s.putanja = name or regexp_replace(s.putanja, '\.jpg$', '_m.jpg') = name)
    )
  );

-- ---------------------------------------------------------------------
-- 9) Serije se razlikuju i po mjestu u planu: ista vježba dvaput u istom danu
--    (npr. čučanj na početku i na kraju) više ne prebrisuje serije one druge.
-- ---------------------------------------------------------------------
alter table public.odradjene_serije drop constraint if exists odradjene_serije_trening_id_vjezba_id_redni_broj_key;
alter table public.odradjene_serije drop constraint if exists odradjene_serije_mjesto_key;
alter table public.odradjene_serije
  add constraint odradjene_serije_mjesto_key unique nulls not distinct (trening_id, plan_vjezba_id, vjezba_id, redni_broj);

-- ---------------------------------------------------------------------
-- 10) Ukinuti stalni termin dobiva datum završetka (prošli termini ostaju u rasporedu)
-- ---------------------------------------------------------------------
alter table public.termini_pravila add column if not exists do_datuma date;
alter table public.termini_pravila drop constraint if exists termini_pravila_do_datuma_check;
alter table public.termini_pravila
  add constraint termini_pravila_do_datuma_check check (do_datuma is null or do_datuma >= od_datuma);
