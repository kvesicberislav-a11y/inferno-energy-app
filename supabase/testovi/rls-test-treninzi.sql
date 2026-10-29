create temp table rez (redoslijed serial, test text, rezultat text);
grant all on rez to authenticated, anon;
grant usage on sequence rez_redoslijed_seq to authenticated, anon;

do $$
declare
  klijent uuid;
  trener uuid;
  v_id uuid;
  plan_a uuid;
  plan_b uuid;
  dan_a uuid;
  dan_b uuid;
  t_id uuid;
  s_id uuid;
  n int;
begin
  select id into klijent from public.profili where uloga = 'klijent' limit 1;
  select id into trener from public.profili where uloga = 'trener' limit 1;

  -- ===== TRENER priprema =====
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.vjezbe (naziv, misicna_skupina) values ('RLS test vjezba', 'Noge') returning id into v_id;
  insert into public.planovi (naziv) values ('RLS plan A') returning id into plan_a;
  insert into public.planovi (naziv) values ('RLS plan B') returning id into plan_b;
  insert into public.plan_dani (plan_id, dan_u_tjednu, naziv) values (plan_a, 1, 'Noge') returning id into dan_a;
  insert into public.plan_dani (plan_id, dan_u_tjednu, naziv) values (plan_b, 2, 'Gornji') returning id into dan_b;
  insert into public.plan_vjezbe (plan_dan_id, vjezba_id, serije, ponavljanja, kg) values (dan_a, v_id, 4, '8-10', 60);
  insert into public.plan_vjezbe (plan_dan_id, vjezba_id, serije, ponavljanja) values (dan_b, v_id, 3, '12');
  perform public.dodijeli_plan(klijent, plan_a);
  insert into rez (test, rezultat) values ('trener pravi vjezbu, planove i dodjeljuje plan A', 'OK');

  -- ===== KLIJENT =====
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);

  select count(*) into n from public.vjezbe where id = v_id;
  insert into rez (test, rezultat) values ('klijent vidi vjezbe', case when n = 1 then 'OK' else 'GRESKA' end);

  select count(*) into n from public.planovi where id in (plan_a, plan_b);
  insert into rez (test, rezultat) values ('klijent vidi samo dodijeljeni plan (1)', case when n = 1 then 'OK' else 'GRESKA ' || n end);

  select count(*) into n from public.plan_vjezbe pv join public.plan_dani d on d.id = pv.plan_dan_id where d.plan_id = plan_a;
  insert into rez (test, rezultat) values ('klijent vidi vjezbe svog plana', case when n = 1 then 'OK' else 'GRESKA ' || n end);

  select count(*) into n from public.plan_vjezbe pv where pv.plan_dan_id = dan_b;
  insert into rez (test, rezultat) values ('klijent ne vidi vjezbe tudjeg plana', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  begin
    insert into public.vjezbe (naziv) values ('hack');
    insert into rez (test, rezultat) values ('klijent NE smije dodati vjezbu', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE smije dodati vjezbu', 'OK');
  end;

  update public.planovi set naziv = 'hack' where id = plan_a;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('klijent NE mijenja plan', case when n = 0 then 'OK' else 'GRESKA' end);

  begin
    perform public.dodijeli_plan(klijent, plan_b);
    insert into rez (test, rezultat) values ('klijent NE smije sam sebi dodijeliti plan', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE smije sam sebi dodijeliti plan', 'OK');
  end;

  begin
    insert into public.treninzi (plan_dan_id, naziv) values (dan_b, 'tudji');
    insert into rez (test, rezultat) values ('klijent NE smije trening iz tudjeg plana', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE smije trening iz tudjeg plana', 'OK');
  end;

  insert into public.treninzi (plan_dan_id, naziv) values (dan_a, 'Noge') returning id into t_id;
  insert into public.odradjene_serije (trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (t_id, v_id, 1, 10, 60) returning id into s_id;
  -- isto kao upsert iz aplikacije
  insert into public.odradjene_serije (trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (t_id, v_id, 1, 9, 62.5)
    on conflict (trening_id, vjezba_id, redni_broj) do update set ponavljanja = excluded.ponavljanja, kg = excluded.kg;
  insert into public.treninzi (klijent_id, plan_dan_id, naziv) values (klijent, dan_a, 'Noge')
    on conflict (klijent_id, datum, plan_dan_id) do update set naziv = excluded.naziv;
  select count(*) into n from public.odradjene_serije where trening_id = t_id and ponavljanja = 9 and kg = 62.5;
  insert into rez (test, rezultat) values ('klijent biljezi i ispravlja seriju (upsert)', case when n = 1 then 'OK' else 'GRESKA ' || n end);

  -- ===== TRENER cita =====
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  select count(*) into n from public.odradjene_serije where trening_id = t_id;
  insert into rez (test, rezultat) values ('trener vidi serije klijenta', case when n = 1 then 'OK' else 'GRESKA ' || n end);
  update public.odradjene_serije set kg = 999 where id = s_id;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('trener NE mijenja serije klijenta', case when n = 0 then 'OK' else 'GRESKA' end);

  -- zamjena plana isti dan: stara dodjela se brise, nova je aktivna
  perform public.dodijeli_plan(klijent, plan_b);
  select count(*) into n from public.dodjele_planova where klijent_id = klijent;
  insert into rez (test, rezultat) values ('promjena plana isti dan ostavlja 1 dodjelu', case when n = 1 then 'OK' else 'GRESKA ' || n end);

  -- ===== ANONIMNI =====
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into n from public.vjezbe;
  insert into rez (test, rezultat) values ('anonimni ne vidi vjezbe', case when n = 0 then 'OK' else 'GRESKA ' || n end);
  select count(*) into n from public.planovi;
  insert into rez (test, rezultat) values ('anonimni ne vidi planove', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  -- ===== POSPREMANJE =====
  execute 'reset role';
  delete from public.odradjene_serije where trening_id = t_id;
  delete from public.treninzi where id = t_id;
  delete from public.dodjele_planova where plan_id in (plan_a, plan_b);
  delete from public.planovi where id in (plan_a, plan_b);
  delete from public.vjezbe where id = v_id;
end $$;

select test, rezultat from rez order by redoslijed;
