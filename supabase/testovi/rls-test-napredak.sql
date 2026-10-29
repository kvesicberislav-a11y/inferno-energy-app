create temp table rez (redoslijed serial, test text, rezultat text);
grant all on rez to authenticated, anon;
grant usage on sequence rez_redoslijed_seq to authenticated, anon;

do $$
declare
  klijent uuid;
  trener uuid;
  netko uuid := gen_random_uuid();
  stara_visina numeric;
  stari_spol text;
  stara_godina smallint;
  m_id uuid;
  n int;
  danas date := public.danas_zagreb();
begin
  select id, visina_cm, spol, godina_rodenja into klijent, stara_visina, stari_spol, stara_godina
  from public.profili where uloga = 'klijent' limit 1;
  select id into trener from public.profili where uloga = 'trener' limit 1;

  -- ===== KLIJENT =====
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.profili set visina_cm = 180, spol = 'm', godina_rodenja = 1990 where id = klijent;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('klijent upisuje visinu, spol, godinu', case when n = 1 then 'OK' else 'GRESKA' end);

  begin
    update public.profili set uloga = 'trener' where id = klijent;
    insert into rez (test, rezultat) values ('klijent NE moze promijeniti ulogu', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE moze promijeniti ulogu', 'OK');
  end;

  update public.profili set visina_cm = 150 where id = trener;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('klijent NE mijenja tudji profil', case when n = 0 then 'OK' else 'GRESKA' end);

  insert into public.mjerenja (tezina_kg, struk_cm, vrat_cm) values (82, 85, 38) returning id into m_id;
  insert into public.mjerenja (tezina_kg, struk_cm, vrat_cm) values (81.5, 84, 38)
    on conflict (klijent_id, datum) do update set tezina_kg = excluded.tezina_kg;
  select count(*) into n from public.mjerenja where id = m_id and tezina_kg = 81.5;
  insert into rez (test, rezultat) values ('klijent unosi i ispravlja mjere (upsert)', case when n = 1 then 'OK' else 'GRESKA' end);

  insert into public.slike_napretka (poza, putanja) values ('sprijeda', klijent::text || '/rls-test-1.jpg');
  insert into public.slike_napretka (poza, putanja) values ('bocno', klijent::text || '/rls-test-2.jpg');
  insert into rez (test, rezultat) values ('klijent dodaje dvije slike istog dana', 'OK');

  begin
    insert into public.slike_napretka (poza, putanja) values ('straga', netko::text || '/x.jpg');
    insert into rez (test, rezultat) values ('klijent NE moze putanju u tudjoj mapi', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE moze putanju u tudjoj mapi', 'OK');
  end;

  begin
    insert into public.slike_napretka (datum, poza, putanja) values (danas - 30, 'straga', klijent::text || '/rls-test-3.jpg');
    insert into rez (test, rezultat) values ('klijent NE moze slike s drugim datumom', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE moze slike s drugim datumom', 'OK');
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('napredak', klijent::text || '/bez-zapisa.jpg');
    insert into rez (test, rezultat) values ('NE moze datoteka bez zapisa (spremiste)', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('NE moze datoteka bez zapisa (spremiste)', 'OK');
  end;

  insert into public.obroci (naziv, proteini) values ('RLS stat', 10);
  select count(*) into n from public.dnevni_makroi(klijent, danas - 1, danas);
  insert into rez (test, rezultat) values ('klijent vidi svoju statistiku', case when n = 1 then 'OK' else 'GRESKA ' || n end);

  -- ===== PRAVILO 14 DANA: set od prije 5 dana blokira, od prije 20 dopusta =====
  execute 'reset role';
  update public.slike_napretka set datum = danas - 5 where klijent_id = klijent and putanja like '%rls-test-%';
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.slike_napretka (poza, putanja) values ('straga', klijent::text || '/rls-test-4.jpg');
    insert into rez (test, rezultat) values ('NE moze novi set unutar 14 dana', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('NE moze novi set unutar 14 dana', 'OK');
  end;
  execute 'reset role';
  update public.slike_napretka set datum = danas - 20 where klijent_id = klijent and putanja like '%rls-test-%';
  execute 'set local role authenticated';
  insert into public.slike_napretka (poza, putanja) values ('straga', klijent::text || '/rls-test-5.jpg');
  insert into rez (test, rezultat) values ('moze novi set nakon 14+ dana', 'OK');

  -- ===== DRUGI KORISNIK =====
  perform set_config('request.jwt.claims', json_build_object('sub', netko, 'role', 'authenticated')::text, true);
  select count(*) into n from public.mjerenja where klijent_id = klijent;
  insert into rez (test, rezultat) values ('drugi NE vidi mjere', case when n = 0 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.slike_napretka where klijent_id = klijent;
  insert into rez (test, rezultat) values ('drugi NE vidi slike', case when n = 0 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.dnevni_makroi(klijent, danas - 1, danas);
  insert into rez (test, rezultat) values ('drugi NE vidi statistiku', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  -- ===== TRENER =====
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  select count(*) into n from public.mjerenja where klijent_id = klijent;
  insert into rez (test, rezultat) values ('trener vidi mjere klijenta', case when n >= 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.slike_napretka where klijent_id = klijent;
  insert into rez (test, rezultat) values ('trener vidi slike klijenta', case when n >= 1 then 'OK' else 'GRESKA' end);
  update public.mjerenja set tezina_kg = 50 where id = m_id;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('trener NE mijenja mjere klijenta', case when n = 0 then 'OK' else 'GRESKA' end);
  update public.profili set visina_cm = 181 where id = klijent;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('trener ispravlja visinu klijenta', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.dnevni_makroi(klijent, danas - 1, danas);
  insert into rez (test, rezultat) values ('trener vidi statistiku klijenta', case when n = 1 then 'OK' else 'GRESKA ' || n end);

  -- ===== POSPREMANJE =====
  execute 'reset role';
  delete from public.slike_napretka where putanja like '%rls-test-%';
  delete from public.mjerenja where id = m_id;
  delete from public.obroci where naziv = 'RLS stat';
  update public.profili set visina_cm = stara_visina, spol = stari_spol, godina_rodenja = stara_godina where id = klijent;
end $$;

select test, rezultat from rez order by redoslijed;
