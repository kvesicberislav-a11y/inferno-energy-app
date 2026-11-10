-- =====================================================================
-- 1) Trening iz kalendara: svaka serija može imati svoja ponavljanja i kilažu
--    (npr. 12×40, 10×45, 8×50). serije_plan = null → sve serije iste
--    (stari zapis: serije × ponavljanja × kg).
--    Oblik: [{"ponavljanja": "12", "kg": 40}, {"ponavljanja": "10", "kg": null}, …]
-- 2) Bazne vježbe klijenta: polazna kilaža × ponavljanja i stalna napomena
--    za tu vježbu (npr. "sjedalo lvl3, gurat se o spužvu"). Napomenu vidi i klijent.
-- =====================================================================

alter table public.trening_vjezbe
  add column if not exists serije_plan jsonb
  check (
    serije_plan is null
    or (jsonb_typeof(serije_plan) = 'array' and jsonb_array_length(serije_plan) between 1 and 20)
  );

alter table public.bazne_vjezbe
  add column if not exists kg numeric(6,1) check (kg is null or kg between 0 and 1000),
  add column if not exists ponavljanja smallint check (ponavljanja is null or ponavljanja between 1 and 1000),
  add column if not exists napomena text not null default '' check (char_length(napomena) <= 300);

-- trener mijenja kilažu i napomenu (do sada su se bazne samo dodavale i brisale)
drop policy if exists "bazne_trener_izmjena" on public.bazne_vjezbe;
create policy "bazne_trener_izmjena" on public.bazne_vjezbe for update to authenticated
  using ((select public.je_trener())) with check ((select public.je_trener()));

-- Kopiranje treninga prenosi i raspored po serijama
create or replace function public.kopiraj_trening(p_klijent uuid, p_iz date, p_u date, p_zamijeni boolean default false)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  izvor public.treninzi;
  cilj uuid;
  n integer;
begin
  if not public.je_trener() then
    raise exception 'Samo trener može kopirati trening.';
  end if;
  select * into izvor from public.treninzi where klijent_id = p_klijent and datum = p_iz and iz_kalendara;
  if not found or not exists (select 1 from public.trening_vjezbe where trening_id = izvor.id) then
    return 0;
  end if;

  select id into cilj from public.treninzi where klijent_id = p_klijent and datum = p_u and iz_kalendara;
  if cilj is not null then
    if exists (select 1 from public.trening_vjezbe where trening_id = cilj) then
      if not p_zamijeni then
        return 0;
      end if;
      delete from public.trening_vjezbe where trening_id = cilj;
    end if;
    update public.treninzi set skupine = izvor.skupine, naziv = izvor.naziv where id = cilj;
  else
    insert into public.treninzi (klijent_id, datum, naziv, skupine, iz_kalendara)
    values (p_klijent, p_u, izvor.naziv, izvor.skupine, true)
    returning id into cilj;
  end if;

  insert into public.trening_vjezbe (trening_id, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena, serije_plan)
  select cilj, vjezba_id, redoslijed, serije, ponavljanja, kg, napomena, serije_plan
    from public.trening_vjezbe where trening_id = izvor.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.kopiraj_trening(uuid, date, date, boolean) from public, anon;
grant execute on function public.kopiraj_trening(uuid, date, date, boolean) to authenticated;
