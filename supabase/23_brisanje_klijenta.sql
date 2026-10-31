-- =====================================================================
-- TRAJNO BRISANJE KLIJENTA (samo trener)
-- Briše klijenta, sve njegove podatke i račun (ako ga ima). Vraća putanje
-- slika napretka da ih aplikacija obriše i iz spremišta.
-- Klijentove vlastite vježbe koje koristi netko drugi ostaju u zajedničkoj biblioteci.
-- =====================================================================

create or replace function public.obrisi_klijenta(p_klijent uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  slike text[];
begin
  if not public.je_trener() then
    raise exception 'Samo trener može obrisati klijenta.';
  end if;
  if not exists (select 1 from public.profili where id = p_klijent and uloga = 'klijent') then
    raise exception 'Klijent nije pronađen.';
  end if;

  select coalesce(array_agg(putanja), '{}') into slike from public.slike_napretka where klijent_id = p_klijent;

  -- prvo sve što koristi vježbe (vježba se ne može obrisati dok je nešto koristi)
  delete from public.odradjene_serije where klijent_id = p_klijent;
  delete from public.treninzi where klijent_id = p_klijent;
  delete from public.plan_vjezbe pv
   using public.plan_dani pd, public.planovi pl
   where pv.plan_dan_id = pd.id and pd.plan_id = pl.id and pl.klijent_id = p_klijent;
  delete from public.zamjene_vjezbi where klijent_id = p_klijent;

  -- vlastite vježbe koje koristi netko drugi prelaze u zajedničku biblioteku
  update public.vjezbe v
     set vlasnik_id = null
   where v.vlasnik_id = p_klijent
     and (exists (select 1 from public.odradjene_serije s where s.vjezba_id = v.id)
       or exists (select 1 from public.trening_vjezbe tv where tv.vjezba_id = v.id)
       or exists (select 1 from public.plan_vjezbe pv where pv.vjezba_id = v.id)
       or exists (select 1 from public.zamjene_vjezbi z where z.vjezba_id = v.id));

  -- profil (ostalo se briše kaskadno: prehrana, mjerenja, termini, poruke, bilješke, pozivnica…) i račun
  delete from public.profili where id = p_klijent;
  delete from auth.users where id = p_klijent;

  return slike;
end;
$$;

revoke execute on function public.obrisi_klijenta(uuid) from public, anon;
grant execute on function public.obrisi_klijenta(uuid) to authenticated;
