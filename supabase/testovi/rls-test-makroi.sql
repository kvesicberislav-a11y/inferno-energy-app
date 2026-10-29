create temp table rez (redoslijed serial, test text, rezultat text);
grant all on rez to authenticated;
grant usage on sequence rez_redoslijed_seq to authenticated;

do $$
declare
  klijent uuid;
  trener uuid;
  n int;
  k numeric;
  obrok_id uuid;
begin
  select id into klijent from public.profili where uloga = 'klijent' limit 1;
  select id into trener from public.profili where uloga = 'trener' limit 1;

  -- ===== KAO KLIJENT =====
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.obroci (naziv, proteini, ugljikohidrati, masti)
  values ('RLS test', 30, 50, 10)
  returning id, kcal into obrok_id, k;
  insert into rez (test, rezultat) values ('klijent unosi obrok (kcal mora biti 410)', case when k = 410 then 'OK' else 'GRESKA ' || k end);

  begin
    insert into public.obroci (klijent_id, naziv, proteini) values (trener, 'tudji', 1);
    insert into rez (test, rezultat) values ('klijent NE smije unijeti obrok za drugoga', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE smije unijeti obrok za drugoga', 'OK');
  end;

  begin
    insert into public.ciljevi_makroa (klijent_id, kcal, proteini, ugljikohidrati, masti) values (klijent, 9999, 1, 1, 1);
    insert into rez (test, rezultat) values ('klijent NE smije postaviti cilj', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE smije postaviti cilj', 'OK');
  end;

  select count(*) into n from public.profili;
  insert into rez (test, rezultat) values ('klijent vidi samo svoj profil', case when n = 1 then 'OK' else 'GRESKA ' || n end);

  select count(*) into n from public.pozivnice;
  insert into rez (test, rezultat) values ('klijent ne vidi pozivnice', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  -- ===== KAO TRENER =====
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);

  select count(*) into n from public.obroci where id = obrok_id;
  insert into rez (test, rezultat) values ('trener vidi obrok klijenta', case when n = 1 then 'OK' else 'GRESKA' end);

  update public.obroci set naziv = 'promijenio trener' where id = obrok_id;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('trener NE mijenja obrok klijenta', case when n = 0 then 'OK' else 'GRESKA' end);

  insert into public.ciljevi_makroa (klijent_id, vrijedi_od, kcal, proteini, ugljikohidrati, masti)
  values (klijent, '2000-01-01', 2000, 150, 200, 60);
  insert into rez (test, rezultat) values ('trener postavlja cilj klijentu', 'OK');

  -- ===== KAO ANONIMNI POSJETITELJ =====
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into n from public.obroci;
  execute 'set local role authenticated';
  insert into rez (test, rezultat) values ('anonimni ne vidi obroke', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  -- ===== POSPREMANJE =====
  execute 'reset role';
  delete from public.obroci where id = obrok_id;
  delete from public.ciljevi_makroa where vrijedi_od = '2000-01-01';
end $$;

select test, rezultat from rez order by redoslijed;
