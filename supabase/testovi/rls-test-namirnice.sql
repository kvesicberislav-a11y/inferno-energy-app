create temp table rez (redoslijed serial, test text, rezultat text);
grant all on rez to authenticated, anon;
grant usage on sequence rez_redoslijed_seq to authenticated, anon;

do $$
declare
  klijent uuid;
  trener uuid;
  netko uuid := gen_random_uuid();
  n_id uuid;
  n int;
begin
  select id into klijent from public.profili where uloga = 'klijent' limit 1;
  select id into trener from public.profili where uloga = 'trener' limit 1;

  -- KLIJENT dodaje proizvod
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.namirnice (barkod, naziv, proteini_100, ugljikohidrati_100, masti_100)
  values ('9999999999994', 'RLS jogurt', 10, 4, 0) returning id into n_id;
  insert into rez (test, rezultat) values ('klijent dodaje proizvod', 'OK');

  begin
    insert into public.namirnice (barkod, naziv, proteini_100, ugljikohidrati_100, masti_100, dodao)
    values ('9999999999995', 'RLS lazni', 1, 1, 1, trener);
    insert into rez (test, rezultat) values ('klijent NE moze dodati u tudje ime', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE moze dodati u tudje ime', 'OK');
  end;

  begin
    insert into public.namirnice (barkod, naziv, proteini_100, ugljikohidrati_100, masti_100)
    values ('9999999999996', 'RLS krivo', 150, 1, 1);
    insert into rez (test, rezultat) values ('baza odbija nemoguce vrijednosti (>100 g na 100 g)', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('baza odbija nemoguce vrijednosti (>100 g na 100 g)', 'OK');
  end;

  -- DRUGI KORISNIK: vidi, ali ne mijenja
  perform set_config('request.jwt.claims', json_build_object('sub', netko, 'role', 'authenticated')::text, true);
  select count(*) into n from public.namirnice where id = n_id;
  insert into rez (test, rezultat) values ('drugi korisnik vidi zajednicki proizvod', case when n = 1 then 'OK' else 'GRESKA' end);
  update public.namirnice set masti_100 = 50 where id = n_id;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('drugi korisnik NE mijenja tudji proizvod', case when n = 0 then 'OK' else 'GRESKA' end);
  delete from public.namirnice where id = n_id;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('drugi korisnik NE brise proizvod', case when n = 0 then 'OK' else 'GRESKA' end);

  -- TRENER ispravlja
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  update public.namirnice set masti_100 = 0.5 where id = n_id;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('trener ispravlja proizvod', case when n = 1 then 'OK' else 'GRESKA' end);

  -- ANONIMNI
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into n from public.namirnice;
  insert into rez (test, rezultat) values ('anonimni NE vidi proizvode', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  execute 'reset role';
  delete from public.namirnice where naziv like 'RLS%';
end $$;

select test, rezultat from rez order by redoslijed;
