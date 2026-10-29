create temp table rez (redoslijed serial, test text, rezultat text);
grant all on rez to authenticated, anon;
grant usage on sequence rez_redoslijed_seq to authenticated, anon;

do $$
declare
  klijent uuid;
  trener uuid;
  netko uuid := gen_random_uuid();
  pr_id uuid;
  dod_id uuid;
  n int;
  stari_nacin text;
begin
  select id, nacin into klijent, stari_nacin from public.profili where uloga = 'klijent' limit 1;
  select id into trener from public.profili where uloga = 'trener' limit 1;

  -- TRENER
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.termini_pravila (klijent_id, dan_u_tjednu, vrijeme) values (klijent, 1, '18:00') returning id into pr_id;
  insert into public.termini_iznimke (pravilo_id, datum, otkazan) values (pr_id, '2030-01-07', true);
  insert into public.termini_dodatni (klijent_id, datum, vrijeme, napomena) values (klijent, '2030-01-09', '07:30', 'RLS') returning id into dod_id;
  insert into rez (test, rezultat) values ('trener dodaje stalni, iznimku i dodatni termin', 'OK');
  perform public.postavi_nacin(klijent, 'online');
  select count(*) into n from public.profili where id = klijent and nacin = 'online';
  insert into rez (test, rezultat) values ('trener mijenja nacin (online)', case when n = 1 then 'OK' else 'GRESKA' end);

  -- KLIJENT
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);
  select count(*) into n from public.termini_pravila where id = pr_id;
  insert into rez (test, rezultat) values ('klijent vidi svoj stalni termin', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.termini_iznimke where pravilo_id = pr_id;
  insert into rez (test, rezultat) values ('klijent vidi iznimku svog termina', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.termini_dodatni where id = dod_id;
  insert into rez (test, rezultat) values ('klijent vidi svoj dodatni termin', case when n = 1 then 'OK' else 'GRESKA' end);
  begin
    insert into public.termini_pravila (klijent_id, dan_u_tjednu, vrijeme) values (klijent, 2, '10:00');
    insert into rez (test, rezultat) values ('klijent NE moze sam dodati termin', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE moze sam dodati termin', 'OK');
  end;
  update public.termini_dodatni set vrijeme = '05:00' where id = dod_id;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('klijent NE mijenja termin', case when n = 0 then 'OK' else 'GRESKA' end);
  begin
    perform public.postavi_nacin(klijent, 'uzivo');
    insert into rez (test, rezultat) values ('klijent NE mijenja nacin rada', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE mijenja nacin rada', 'OK');
  end;
  begin
    update public.profili set nacin = 'uzivo' where id = klijent;
    insert into rez (test, rezultat) values ('klijent NE mijenja nacin ni izravno', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE mijenja nacin ni izravno', 'OK');
  end;

  -- DRUGI KORISNIK
  perform set_config('request.jwt.claims', json_build_object('sub', netko, 'role', 'authenticated')::text, true);
  select count(*) into n from public.termini_pravila;
  insert into rez (test, rezultat) values ('drugi NE vidi tudje termine', case when n = 0 then 'OK' else 'GRESKA ' || n end);
  select count(*) into n from public.termini_iznimke;
  insert into rez (test, rezultat) values ('drugi NE vidi tudje iznimke', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  -- POSPREMANJE
  execute 'reset role';
  delete from public.termini_pravila where id = pr_id;
  delete from public.termini_dodatni where id = dod_id;
  update public.profili set nacin = stari_nacin where id = klijent;
end $$;

select test, rezultat from rez order by redoslijed;
