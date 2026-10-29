create temp table rez (redoslijed serial, test text, rezultat text);
grant all on rez to authenticated, anon;
grant usage on sequence rez_redoslijed_seq to authenticated, anon;

do $$
declare
  klijent uuid;
  trener uuid;
  netko uuid := gen_random_uuid();
  b_id uuid;
  n int;
  t text;
begin
  select id into klijent from public.profili where uloga = 'klijent' limit 1;
  select id into trener from public.profili where uloga = 'trener' limit 1;

  -- TRENER
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.biljeske_trenera (klijent_id, tekst) values (klijent, 'RLS tajna biljeska') returning id into b_id;
  update public.biljeske_trenera set tekst = 'RLS tajna biljeska 2' where id = b_id;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('trener pise i mijenja biljesku', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.pregled_klijenata();
  insert into rez (test, rezultat) values ('trener vidi pregled svih klijenata', case when n >= 1 then 'OK (' || n || ')' else 'GRESKA' end);

  -- KLIJENT
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);
  select count(*) into n from public.biljeske_trenera;
  insert into rez (test, rezultat) values ('klijent NE vidi biljeske', case when n = 0 then 'OK' else 'GRESKA ' || n end);
  begin
    insert into public.biljeske_trenera (klijent_id, tekst) values (klijent, 'hack');
    insert into rez (test, rezultat) values ('klijent NE pise biljeske', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE pise biljeske', 'OK');
  end;
  select count(*), max(id::text) into n, t from public.pregled_klijenata();
  insert into rez (test, rezultat) values ('klijent u pregledu vidi samo sebe', case when n <= 1 and (t is null or t = klijent::text) then 'OK' else 'GRESKA ' || n end);

  -- DRUGI KORISNIK
  perform set_config('request.jwt.claims', json_build_object('sub', netko, 'role', 'authenticated')::text, true);
  select count(*) into n from public.pregled_klijenata();
  insert into rez (test, rezultat) values ('drugi korisnik NE vidi pregled', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  -- ANONIMNI
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform public.pregled_klijenata();
    insert into rez (test, rezultat) values ('anonimni NE moze pozvati pregled', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('anonimni NE moze pozvati pregled', 'OK');
  end;

  execute 'reset role';
  delete from public.biljeske_trenera where id = b_id;
end $$;

select test, rezultat from rez order by redoslijed;
