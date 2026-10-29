create temp table rez (redoslijed serial, test text, rezultat text);
grant all on rez to authenticated, anon;
grant usage on sequence rez_redoslijed_seq to authenticated, anon;

do $$
declare
  klijent uuid;
  trener uuid;
  netko uuid := gen_random_uuid();
  v_lib uuid;
  v_moja uuid;
  plan_a uuid;
  plan_b uuid;
  dan_a uuid;
  dan_b uuid;
  pv_a uuid;
  pv_b uuid;
  t_id uuid;
  n int;
begin
  select id into klijent from public.profili where uloga = 'klijent' limit 1;
  select id into trener from public.profili where uloga = 'trener' limit 1;

  -- TRENER: biblioteka, plan A (dodijeljen), plan B (nije)
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.vjezbe (naziv, misicna_skupina) values ('RLS lib', 'Noge') returning id into v_lib;
  insert into public.planovi (naziv) values ('RLS A') returning id into plan_a;
  insert into public.planovi (naziv) values ('RLS B') returning id into plan_b;
  insert into public.plan_dani (plan_id, dan_u_tjednu) values (plan_a, 1) returning id into dan_a;
  insert into public.plan_dani (plan_id, dan_u_tjednu) values (plan_b, 1) returning id into dan_b;
  insert into public.plan_vjezbe (plan_dan_id, vjezba_id) values (dan_a, v_lib) returning id into pv_a;
  insert into public.plan_vjezbe (plan_dan_id, vjezba_id) values (dan_b, v_lib) returning id into pv_b;
  perform public.dodijeli_plan(klijent, plan_a);

  -- KLIJENT
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);

  insert into public.vjezbe (naziv, misicna_skupina, opis, vlasnik_id) values ('RLS moja', 'Noge', 'leg press', klijent) returning id into v_moja;
  insert into rez (test, rezultat) values ('klijent dodaje svoju vjezbu', 'OK');

  begin
    insert into public.vjezbe (naziv) values ('RLS hack zajednicka');
    insert into rez (test, rezultat) values ('klijent NE dodaje u zajednicku biblioteku', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE dodaje u zajednicku biblioteku', 'OK');
  end;

  begin
    insert into public.vjezbe (naziv, vlasnik_id, slika_url) values ('RLS hack slika', klijent, 'https://x.y/z.jpg');
    insert into rez (test, rezultat) values ('klijent NE dodaje sliku', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE dodaje sliku', 'OK');
  end;

  update public.vjezbe set opis = 'hack' where id = v_lib;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('klijent NE mijenja zajednicku vjezbu', case when n = 0 then 'OK' else 'GRESKA' end);

  begin
    update public.vjezbe set vlasnik_id = null where id = v_moja;
    get diagnostics n = row_count;
    insert into rez (test, rezultat) values ('klijent NE premjesta svoju u biblioteku', case when n = 0 then 'OK' else 'GRESKA - uspjelo' end);
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE premjesta svoju u biblioteku', 'OK');
  end;

  insert into public.zamjene_vjezbi (plan_vjezba_id, vjezba_id) values (pv_a, v_moja);
  insert into rez (test, rezultat) values ('klijent zamjenjuje vjezbu u svom planu', 'OK');

  begin
    insert into public.zamjene_vjezbi (plan_vjezba_id, vjezba_id) values (pv_b, v_moja);
    insert into rez (test, rezultat) values ('klijent NE zamjenjuje u tudjem planu', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE zamjenjuje u tudjem planu', 'OK');
  end;

  insert into public.treninzi (plan_dan_id, naziv) values (dan_a, 'RLS') returning id into t_id;
  insert into public.odradjene_serije (trening_id, vjezba_id, plan_vjezba_id, redni_broj, ponavljanja, kg)
  values (t_id, v_moja, pv_a, 1, 12, 100);
  insert into rez (test, rezultat) values ('klijent biljezi seriju na zamjensku vjezbu', 'OK');

  -- NETKO DRUGI (drugi prijavljeni korisnik)
  perform set_config('request.jwt.claims', json_build_object('sub', netko, 'role', 'authenticated')::text, true);
  select count(*) into n from public.vjezbe where id = v_moja;
  insert into rez (test, rezultat) values ('drugi korisnik NE vidi klijentovu vjezbu', case when n = 0 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.zamjene_vjezbi;
  insert into rez (test, rezultat) values ('drugi korisnik NE vidi zamjene', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  -- TRENER
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  select count(*) into n from public.zamjene_vjezbi where klijent_id = klijent;
  insert into rez (test, rezultat) values ('trener vidi zamjene klijenta', case when n = 1 then 'OK' else 'GRESKA ' || n end);
  update public.vjezbe set vlasnik_id = null where id = v_moja;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('trener premjesta vjezbu u biblioteku', case when n = 1 then 'OK' else 'GRESKA' end);

  -- POSPREMANJE
  execute 'reset role';
  delete from public.odradjene_serije where trening_id = t_id;
  delete from public.treninzi where id = t_id;
  delete from public.zamjene_vjezbi where plan_vjezba_id in (pv_a, pv_b);
  delete from public.dodjele_planova where plan_id in (plan_a, plan_b);
  delete from public.planovi where id in (plan_a, plan_b);
  delete from public.vjezbe where id in (v_lib, v_moja);
end $$;

select test, rezultat from rez order by redoslijed;
