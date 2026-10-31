-- =====================================================================
-- Praćene vježbe klijenta: koje vježbe trener želi vidjeti u izvještaju
-- i grafu napretka. Bez redova = sve vježbe.
-- =====================================================================
create table public.pracene_vjezbe (
  klijent_id  uuid not null references public.profili (id) on delete cascade,
  vjezba_id   uuid not null references public.vjezbe (id) on delete cascade,
  kreirano    timestamptz not null default now(),
  primary key (klijent_id, vjezba_id)
);

create index pracene_vjezbe_vjezba on public.pracene_vjezbe (vjezba_id);

alter table public.pracene_vjezbe enable row level security;

create policy "pracene_citanje" on public.pracene_vjezbe for select to authenticated
  using (klijent_id = (select auth.uid()) or (select public.je_trener()));
create policy "pracene_trener_unos" on public.pracene_vjezbe for insert to authenticated
  with check ((select public.je_trener()));
create policy "pracene_trener_brisanje" on public.pracene_vjezbe for delete to authenticated
  using ((select public.je_trener()));
