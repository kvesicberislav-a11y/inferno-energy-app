-- =====================================================================
-- Vlastite vježbe klijenta i zamjena vježbe iz plana
-- (svaka teretana ima druge sprave)
-- =====================================================================

-- Vježba s vlasnikom = vlastita vježba klijenta (vidi je samo on i trener).
-- Vježba bez vlasnika = zajednička biblioteka trenera.
alter table public.vjezbe
  add column vlasnik_id uuid references public.profili (id) on delete cascade;

create index vjezbe_vlasnik on public.vjezbe (vlasnik_id);

drop policy "vjezbe_citanje" on public.vjezbe;
drop policy "vjezbe_trener_unos" on public.vjezbe;
drop policy "vjezbe_trener_izmjena" on public.vjezbe;
drop policy "vjezbe_trener_brisanje" on public.vjezbe;

create policy "vjezbe_citanje" on public.vjezbe for select to authenticated
  using (vlasnik_id is null or vlasnik_id = (select auth.uid()) or (select public.je_trener()));

-- Klijent smije dodati samo svoju vježbu, bez slike (slike učitava samo trener)
create policy "vjezbe_unos" on public.vjezbe for insert to authenticated
  with check (
    (select public.je_trener())
    or (vlasnik_id = (select auth.uid()) and slika_url is null)
  );

create policy "vjezbe_izmjena" on public.vjezbe for update to authenticated
  using ((select public.je_trener()) or vlasnik_id = (select auth.uid()))
  with check (
    (select public.je_trener())
    or (vlasnik_id = (select auth.uid()) and slika_url is null)
  );

create policy "vjezbe_brisanje" on public.vjezbe for delete to authenticated
  using ((select public.je_trener()) or vlasnik_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- ZAMJENE: "u mojoj teretani umjesto X radim Y" (vrijedi dok je ne vrati)
-- ---------------------------------------------------------------------
create table public.zamjene_vjezbi (
  id              uuid primary key default gen_random_uuid(),
  klijent_id      uuid not null default auth.uid() references public.profili (id) on delete cascade,
  plan_vjezba_id  uuid not null references public.plan_vjezbe (id) on delete cascade,
  vjezba_id       uuid not null references public.vjezbe (id) on delete restrict,
  kreirano        timestamptz not null default now(),
  unique (klijent_id, plan_vjezba_id)
);

create or replace function public.ima_pristup_plan_vjezbi(p_plan_vjezba uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.ima_pristup_danu(plan_dan_id) from public.plan_vjezbe where id = p_plan_vjezba),
    false
  );
$$;

alter table public.zamjene_vjezbi enable row level security;

create policy "zamjene_citanje" on public.zamjene_vjezbi for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));

create policy "zamjene_klijent_unos" on public.zamjene_vjezbi for insert to authenticated
  with check (
    klijent_id = (select auth.uid())
    and public.ima_pristup_plan_vjezbi(plan_vjezba_id)
    and exists (select 1 from public.vjezbe v where v.id = vjezba_id)
  );

create policy "zamjene_klijent_izmjena" on public.zamjene_vjezbi for update to authenticated
  using (klijent_id = (select auth.uid()))
  with check (
    klijent_id = (select auth.uid())
    and public.ima_pristup_plan_vjezbi(plan_vjezba_id)
    and exists (select 1 from public.vjezbe v where v.id = vjezba_id)
  );

create policy "zamjene_brisanje" on public.zamjene_vjezbi for delete to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));

-- ---------------------------------------------------------------------
-- SERIJE pamte i mjesto u planu (da se zna koju vježbu iz plana zamjenjuju)
-- ---------------------------------------------------------------------
alter table public.odradjene_serije
  add column plan_vjezba_id uuid references public.plan_vjezbe (id) on delete set null;

drop policy "serije_klijent_unos" on public.odradjene_serije;
drop policy "serije_klijent_izmjena" on public.odradjene_serije;

create policy "serije_klijent_unos" on public.odradjene_serije for insert to authenticated
  with check (
    klijent_id = (select auth.uid())
    and exists (select 1 from public.treninzi t where t.id = trening_id and t.klijent_id = (select auth.uid()))
    and exists (select 1 from public.vjezbe v where v.id = vjezba_id)
  );

create policy "serije_klijent_izmjena" on public.odradjene_serije for update to authenticated
  using (klijent_id = (select auth.uid()))
  with check (
    klijent_id = (select auth.uid())
    and exists (select 1 from public.treninzi t where t.id = trening_id and t.klijent_id = (select auth.uid()))
    and exists (select 1 from public.vjezbe v where v.id = vjezba_id)
  );
