-- =====================================================================
-- KLIJENT BEZ RAČUNA
-- Trener vodi klijenta odmah (povijest, raspored, treninzi), a račun se
-- spoji kad se klijent registrira preko svoje pozivnice: poslužitelj
-- stvori račun s istim id-jem pa svi podaci ostaju na mjestu.
-- =====================================================================

-- 1) Profil više ne mora imati račun. Brisanjem računa i dalje se briše profil.
alter table public.profili drop constraint if exists profili_id_fkey;
alter table public.profili add column if not exists registriran boolean not null default true;

create or replace function public.na_brisanje_korisnika()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profili where id = old.id;
  return old;
end;
$$;

revoke execute on function public.na_brisanje_korisnika() from public, anon, authenticated;

drop trigger if exists na_brisanje_korisnika on auth.users;
create trigger na_brisanje_korisnika
  after delete on auth.users
  for each row execute function public.na_brisanje_korisnika();

-- 2) Pozivnica vezana uz postojećeg klijenta bez računa (najviše jedna neiskorištena po klijentu).
alter table public.pozivnice
  add column if not exists profil_id uuid references public.profili (id) on delete cascade;
create unique index if not exists pozivnice_profil on public.pozivnice (profil_id)
  where profil_id is not null and iskoristena_at is null;

-- 3) Novi račun: ako profil s tim id-jem već postoji (klijent bez računa), samo ga dopuni.
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
  if exists (select 1 from public.profili where id = new.id) then
    update public.profili
       set email = coalesce(new.email, ''),
           ime = coalesce(nullif(new.raw_user_meta_data ->> 'ime', ''), ime),
           registriran = true
     where id = new.id and not registriran;
    if not found then
      raise exception 'Ovaj profil već ima račun.';
    end if;
  else
    insert into public.profili (id, email, ime)
    values (
      new.id,
      coalesce(new.email, ''),
      coalesce(new.raw_user_meta_data ->> 'ime', '')
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.novi_korisnik() from public, anon, authenticated;

-- 4) Pripremljeni podaci se mogu prenijeti i na klijenta bez računa (odmah, bez čekanja registracije).
create or replace function public.prenesi_pripremljene_podatke(p_pozivnica uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pp public.pripremljeni_podaci;
  k uuid;
  t jsonb;
  v jsonb;
  tid uuid;
  kad timestamptz;
  danas date := public.danas_zagreb();
  broj int := 0;
begin
  select * into pp from public.pripremljeni_podaci where pozivnica_id = p_pozivnica for update;
  if not found or pp.prenesen_at is not null then
    return 0;
  end if;

  select pr.id into k
    from public.pozivnice po
    join public.profili pr on pr.id = coalesce(po.iskoristio, po.profil_id) and pr.uloga = 'klijent'
   where po.id = p_pozivnica;
  if k is null then
    return 0;
  end if;

  -- povijest treninga (kao da ih je trener upisao iz rasporeda)
  for t in select * from jsonb_array_elements(pp.treninzi) loop
    kad := ((t->>'datum') || ' 19:00')::timestamp at time zone 'Europe/Zagreb';
    tid := null;
    insert into public.treninzi (klijent_id, datum, naziv, zavrsen, zavrseno_at, iz_kalendara, kreirano)
    values (k, (t->>'datum')::date, 'Trening', true, kad, true, kad)
    on conflict (klijent_id, datum) where iz_kalendara do nothing
    returning id into tid;
    continue when tid is null;
    broj := broj + 1;

    for v in select * from jsonb_array_elements(t->'vjezbe') loop
      continue when not exists (select 1 from public.vjezbe where id = (v->>'vjezba_id')::uuid);
      insert into public.trening_vjezbe (trening_id, vjezba_id, redoslijed, serije, ponavljanja, kg)
      values (tid, (v->>'vjezba_id')::uuid, (v->>'redoslijed')::int, (v->>'serije')::smallint,
              v->>'ponavljanja', (v->>'kg')::numeric)
      on conflict (trening_id, vjezba_id) do nothing;
      insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg, kreirano)
      select k, tid, (v->>'vjezba_id')::uuid, (x->>'redni')::smallint, (x->>'ponavljanja')::smallint, (x->>'kg')::numeric, kad
        from jsonb_array_elements(v->'odradeno') x
      on conflict do nothing;
    end loop;

    -- mišićne skupine treninga redom kako idu vježbe
    update public.treninzi tr
       set skupine = s.skupine, naziv = left(array_to_string(s.skupine, ' · '), 60)
      from (
        select array_agg(skupina order by prvi) as skupine
          from (select v2.misicna_skupina as skupina, min(tv.redoslijed) as prvi
                  from public.trening_vjezbe tv join public.vjezbe v2 on v2.id = tv.vjezba_id
                 where tv.trening_id = tid group by v2.misicna_skupina) g
      ) s
     where tr.id = tid and s.skupine is not null;
  end loop;

  insert into public.bazne_vjezbe (klijent_id, vjezba_id)
  select k, b from unnest(pp.bazne) b
   where exists (select 1 from public.vjezbe where id = b)
  on conflict do nothing;

  -- stalni termini vrijede od dana registracije (ili od zadanog datuma, ako je kasniji)
  insert into public.termini_pravila (klijent_id, dan_u_tjednu, vrijeme, trajanje_min, od_datuma)
  select k, (x->>'dan_u_tjednu')::smallint, (x->>'vrijeme')::time, (x->>'trajanje_min')::smallint,
         greatest(danas, coalesce((x->>'od_datuma')::date, danas))
    from jsonb_array_elements(pp.termini) x;

  -- jednokratni termini, i prošli (povijest iz kalendara) i budući
  insert into public.termini_dodatni (klijent_id, datum, vrijeme, trajanje_min)
  select k, (x->>'datum')::date, (x->>'vrijeme')::time, (x->>'trajanje_min')::smallint
    from jsonb_array_elements(pp.dodatni) x;

  update public.pripremljeni_podaci set prenesen_at = now(), greska = null where pozivnica_id = p_pozivnica;
  return broj;
end;
$$;

revoke execute on function public.prenesi_pripremljene_podatke(uuid) from public, anon, authenticated;
