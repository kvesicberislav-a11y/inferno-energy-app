-- =====================================================================
-- KORAK 3: vježbe, planovi treninga, dodjela klijentu i odrađeni treninzi
-- =====================================================================

-- ---------------------------------------------------------------------
-- BIBLIOTEKA VJEŽBI (puni trener)
-- ---------------------------------------------------------------------
create table public.vjezbe (
  id               uuid primary key default gen_random_uuid(),
  naziv            text not null check (char_length(naziv) between 1 and 80),
  misicna_skupina  text not null default 'Ostalo' check (char_length(misicna_skupina) between 1 and 40),
  opis             text not null default '' check (char_length(opis) <= 2000),
  youtube_url      text check (youtube_url is null or char_length(youtube_url) <= 300),
  slika_url        text check (slika_url is null or char_length(slika_url) <= 500),
  kreirano         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PLANOVI: plan -> dani u tjednu -> vježbe (serije × ponavljanja × kg)
-- ---------------------------------------------------------------------
create table public.planovi (
  id         uuid primary key default gen_random_uuid(),
  naziv      text not null check (char_length(naziv) between 1 and 80),
  opis       text not null default '' check (char_length(opis) <= 1000),
  arhiviran  boolean not null default false,
  kreirano   timestamptz not null default now()
);

create table public.plan_dani (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.planovi (id) on delete cascade,
  dan_u_tjednu  smallint not null check (dan_u_tjednu between 1 and 7), -- 1 = ponedjeljak
  naziv         text not null default '' check (char_length(naziv) <= 60),
  unique (plan_id, dan_u_tjednu)
);

create table public.plan_vjezbe (
  id            uuid primary key default gen_random_uuid(),
  plan_dan_id   uuid not null references public.plan_dani (id) on delete cascade,
  vjezba_id     uuid not null references public.vjezbe (id) on delete restrict,
  redoslijed    integer not null default 0,
  serije        smallint not null default 3 check (serije between 1 and 20),
  ponavljanja   text not null default '10' check (char_length(ponavljanja) between 1 and 20),
  kg            numeric(6,1) check (kg is null or kg between 0 and 1000),
  napomena      text not null default '' check (char_length(napomena) <= 300)
);

create index plan_vjezbe_dan on public.plan_vjezbe (plan_dan_id, redoslijed);

-- ---------------------------------------------------------------------
-- DODJELA PLANA KLIJENTU (jedan aktivan plan; do_datuma je isključiv)
-- ---------------------------------------------------------------------
create table public.dodjele_planova (
  id          uuid primary key default gen_random_uuid(),
  klijent_id  uuid not null references public.profili (id) on delete cascade,
  plan_id     uuid not null references public.planovi (id) on delete restrict,
  od_datuma   date not null default public.danas_zagreb(),
  do_datuma   date,
  kreirano    timestamptz not null default now(),
  check (do_datuma is null or do_datuma >= od_datuma)
);

create unique index dodjele_jedna_aktivna on public.dodjele_planova (klijent_id) where do_datuma is null;
create index dodjele_plan on public.dodjele_planova (plan_id);

-- ---------------------------------------------------------------------
-- ODRAĐENI TRENINZI I SERIJE (unosi klijent)
-- ---------------------------------------------------------------------
create table public.treninzi (
  id            uuid primary key default gen_random_uuid(),
  klijent_id    uuid not null default auth.uid() references public.profili (id) on delete cascade,
  datum         date not null default public.danas_zagreb(),
  plan_dan_id   uuid references public.plan_dani (id) on delete set null,
  naziv         text not null default '' check (char_length(naziv) <= 60),
  zavrsen       boolean not null default false,
  zavrseno_at   timestamptz,
  kreirano      timestamptz not null default now()
);

create unique index treninzi_jedan_po_danu on public.treninzi (klijent_id, datum, plan_dan_id);
create index treninzi_klijent_datum on public.treninzi (klijent_id, datum);

create table public.odradjene_serije (
  id            uuid primary key default gen_random_uuid(),
  klijent_id    uuid not null default auth.uid() references public.profili (id) on delete cascade,
  trening_id    uuid not null references public.treninzi (id) on delete cascade,
  vjezba_id     uuid not null references public.vjezbe (id) on delete restrict,
  redni_broj    smallint not null check (redni_broj between 1 and 50),
  ponavljanja   smallint not null check (ponavljanja between 0 and 1000),
  kg            numeric(6,1) not null default 0 check (kg between 0 and 1000),
  kreirano      timestamptz not null default now(),
  unique (trening_id, vjezba_id, redni_broj)
);

create index serije_klijent_vjezba on public.odradjene_serije (klijent_id, vjezba_id, kreirano desc);

-- ---------------------------------------------------------------------
-- POMOĆNE FUNKCIJE ZA ZAŠTITU
-- ---------------------------------------------------------------------
-- Smije li prijavljeni korisnik vidjeti plan? (trener uvijek, klijent ako mu je dodijeljen)
create or replace function public.ima_pristup_planu(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.je_trener() or exists (
    select 1 from public.dodjele_planova
    where plan_id = p_plan and klijent_id = auth.uid()
  );
$$;

create or replace function public.ima_pristup_danu(p_dan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.ima_pristup_planu(plan_id) from public.plan_dani where id = p_dan),
    false
  );
$$;

-- Dodjela (ili uklanjanje, ako je p_plan null) plana klijentu – samo trener
create or replace function public.dodijeli_plan(p_klijent uuid, p_plan uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.je_trener() then
    raise exception 'Samo trener može dodijeliti plan.';
  end if;
  update public.dodjele_planova
     set do_datuma = public.danas_zagreb()
   where klijent_id = p_klijent and do_datuma is null;
  -- dodjela koja je počela i završila danas nema smisla – briši je
  delete from public.dodjele_planova
   where klijent_id = p_klijent and od_datuma = do_datuma;
  if p_plan is not null then
    insert into public.dodjele_planova (klijent_id, plan_id) values (p_klijent, p_plan);
  end if;
end;
$$;

revoke execute on function public.dodijeli_plan(uuid, uuid) from public, anon;
grant execute on function public.dodijeli_plan(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ZAŠTITA PODATAKA
-- ---------------------------------------------------------------------
alter table public.vjezbe            enable row level security;
alter table public.planovi           enable row level security;
alter table public.plan_dani         enable row level security;
alter table public.plan_vjezbe       enable row level security;
alter table public.dodjele_planova   enable row level security;
alter table public.treninzi          enable row level security;
alter table public.odradjene_serije  enable row level security;

-- Vježbe: svi prijavljeni čitaju, trener uređuje
create policy "vjezbe_citanje" on public.vjezbe for select to authenticated using (true);
create policy "vjezbe_trener_unos" on public.vjezbe for insert to authenticated with check ((select public.je_trener()));
create policy "vjezbe_trener_izmjena" on public.vjezbe for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "vjezbe_trener_brisanje" on public.vjezbe for delete to authenticated using ((select public.je_trener()));

-- Planovi: trener sve, klijent samo dodijeljene (čitanje)
create policy "planovi_citanje" on public.planovi for select to authenticated using (public.ima_pristup_planu(id));
create policy "planovi_trener_unos" on public.planovi for insert to authenticated with check ((select public.je_trener()));
create policy "planovi_trener_izmjena" on public.planovi for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "planovi_trener_brisanje" on public.planovi for delete to authenticated using ((select public.je_trener()));

create policy "plan_dani_citanje" on public.plan_dani for select to authenticated using (public.ima_pristup_planu(plan_id));
create policy "plan_dani_trener_unos" on public.plan_dani for insert to authenticated with check ((select public.je_trener()));
create policy "plan_dani_trener_izmjena" on public.plan_dani for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "plan_dani_trener_brisanje" on public.plan_dani for delete to authenticated using ((select public.je_trener()));

create policy "plan_vjezbe_citanje" on public.plan_vjezbe for select to authenticated using (public.ima_pristup_danu(plan_dan_id));
create policy "plan_vjezbe_trener_unos" on public.plan_vjezbe for insert to authenticated with check ((select public.je_trener()));
create policy "plan_vjezbe_trener_izmjena" on public.plan_vjezbe for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "plan_vjezbe_trener_brisanje" on public.plan_vjezbe for delete to authenticated using ((select public.je_trener()));

-- Dodjele: klijent vidi svoje, trener sve
create policy "dodjele_citanje" on public.dodjele_planova for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "dodjele_trener_unos" on public.dodjele_planova for insert to authenticated with check ((select public.je_trener()));
create policy "dodjele_trener_izmjena" on public.dodjele_planova for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));
create policy "dodjele_trener_brisanje" on public.dodjele_planova for delete to authenticated using ((select public.je_trener()));

-- Treninzi: klijent upravlja svojima, trener čita
create policy "treninzi_citanje" on public.treninzi for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "treninzi_klijent_unos" on public.treninzi for insert to authenticated
  with check (klijent_id = (select auth.uid()) and (plan_dan_id is null or public.ima_pristup_danu(plan_dan_id)));
create policy "treninzi_klijent_izmjena" on public.treninzi for update to authenticated
  using (klijent_id = (select auth.uid()))
  with check (klijent_id = (select auth.uid()) and (plan_dan_id is null or public.ima_pristup_danu(plan_dan_id)));
create policy "treninzi_klijent_brisanje" on public.treninzi for delete to authenticated
  using (klijent_id = (select auth.uid()));

-- Serije: klijent upravlja svojima (samo u svojim treninzima), trener čita
create policy "serije_citanje" on public.odradjene_serije for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "serije_klijent_unos" on public.odradjene_serije for insert to authenticated
  with check (
    klijent_id = (select auth.uid())
    and exists (select 1 from public.treninzi t where t.id = trening_id and t.klijent_id = (select auth.uid()))
  );
create policy "serije_klijent_izmjena" on public.odradjene_serije for update to authenticated
  using (klijent_id = (select auth.uid()))
  with check (
    klijent_id = (select auth.uid())
    and exists (select 1 from public.treninzi t where t.id = trening_id and t.klijent_id = (select auth.uid()))
  );
create policy "serije_klijent_brisanje" on public.odradjene_serije for delete to authenticated
  using (klijent_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- SLIKE VJEŽBI (javno spremište, učitava samo trener)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vjezbe', 'vjezbe', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "vjezbe_slike_trener_unos" on storage.objects for insert to authenticated
  with check (bucket_id = 'vjezbe' and (select public.je_trener()));
create policy "vjezbe_slike_trener_izmjena" on storage.objects for update to authenticated
  using (bucket_id = 'vjezbe' and (select public.je_trener()))
  with check (bucket_id = 'vjezbe' and (select public.je_trener()));
create policy "vjezbe_slike_trener_brisanje" on storage.objects for delete to authenticated
  using (bucket_id = 'vjezbe' and (select public.je_trener()));
