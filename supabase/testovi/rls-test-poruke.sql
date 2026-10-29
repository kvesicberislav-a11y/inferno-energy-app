create temp table rez (redoslijed serial, test text, rezultat text);
grant all on rez to authenticated, anon;
grant usage on sequence rez_redoslijed_seq to authenticated, anon;

do $$
declare
  klijent uuid;
  trener uuid;
  netko uuid := gen_random_uuid();
  p_tr uuid;
  p_kl uuid;
  p_drugi uuid;
  drugi uuid;
  n int;
  t text;
  ep text := 'https://fcm.googleapis.com/fcm/send/RLS-TEST-' || gen_random_uuid();
begin
  select id into klijent from public.profili where uloga = 'klijent' order by kreirano limit 1;
  select id into trener from public.profili where uloga = 'trener' limit 1;
  select id into drugi from public.profili where uloga <> 'trener' and id <> klijent limit 1; -- moze biti null

  -- poslužitelj upisuje poruke (zaobilazi RLS)
  insert into public.poruke (klijent_id, autor_id, od_trenera, tekst) values (klijent, trener, true, 'RLS od trenera') returning id into p_tr;
  insert into public.poruke (klijent_id, autor_id, od_trenera, tekst) values (klijent, klijent, false, 'RLS od klijenta') returning id into p_kl;
  if drugi is not null then
    insert into public.poruke (klijent_id, autor_id, od_trenera, tekst) values (drugi, trener, true, 'RLS drugi') returning id into p_drugi;
  end if;

  -- KLIJENT
  perform set_config('request.jwt.claims', json_build_object('sub', klijent, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.poruke where id in (p_tr, p_kl);
  insert into rez (test, rezultat) values ('klijent vidi svoj razgovor', case when n = 2 then 'OK' else 'GRESKA ' || n end);
  select count(*) into n from public.poruke where klijent_id <> klijent;
  insert into rez (test, rezultat) values ('klijent NE vidi tudje poruke', case when n = 0 then 'OK' else 'GRESKA ' || n end);
  begin
    insert into public.poruke (klijent_id, autor_id, od_trenera, tekst) values (klijent, klijent, false, 'hack');
    insert into rez (test, rezultat) values ('klijent NE upisuje izravno', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('klijent NE upisuje izravno', 'OK');
  end;
  update public.poruke set tekst = 'hack' where id = p_tr;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('klijent NE mijenja poruke', case when n = 0 then 'OK' else 'GRESKA' end);
  delete from public.poruke where id = p_tr;
  get diagnostics n = row_count;
  insert into rez (test, rezultat) values ('klijent NE brise poruke', case when n = 0 then 'OK' else 'GRESKA' end);
  perform public.oznaci_procitano(klijent);
  select count(*) into n from public.poruke where id = p_tr and procitano is not null;
  insert into rez (test, rezultat) values ('klijent oznacava poruku trenera procitanom', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.poruke where id = p_kl and procitano is not null;
  insert into rez (test, rezultat) values ('...ali ne i svoju poruku', case when n = 0 then 'OK' else 'GRESKA' end);
  if drugi is not null then
    perform public.oznaci_procitano(drugi);
  end if;
  select count(*), max(klijent_id::text) into n, t from public.razgovori();
  insert into rez (test, rezultat) values ('klijent u razgovorima vidi samo sebe', case when n <= 1 and (t is null or t = klijent::text) then 'OK' else 'GRESKA ' || n end);
  perform public.spremi_pretplatu(ep, 'kljuc', 'tajna');
  insert into rez (test, rezultat) values ('klijent sprema svoj uredjaj', 'OK');
  begin
    perform public.spremi_pretplatu('https://zli-server.example.com/x', 'k', 'a');
    insert into rez (test, rezultat) values ('nepoznata adresa za obavijesti odbijena', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('nepoznata adresa za obavijesti odbijena', 'OK');
  end;
  select count(*) into n from public.push_pretplate;
  insert into rez (test, rezultat) values ('nitko NE cita pretplate izravno', case when n = 0 then 'OK' else 'GRESKA ' || n end);

  -- TRENER
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  select count(*) into n from public.poruke where id in (p_tr, p_kl, p_drugi);
  insert into rez (test, rezultat) values ('trener vidi sve razgovore', case when n = (case when drugi is null then 2 else 3 end) then 'OK' else 'GRESKA ' || n end);
  select r.neprocitano into n from public.razgovori() r where r.klijent_id = klijent;
  insert into rez (test, rezultat) values ('trener vidi 1 neprocitanu od klijenta', case when n >= 1 then 'OK (' || n || ')' else 'GRESKA ' || coalesce(n, -1) end);
  if p_drugi is not null then
    select count(*) into n from public.poruke where id = p_drugi and procitano is null;
    insert into rez (test, rezultat) values ('klijent NE oznacava tudji razgovor', case when n = 1 then 'OK' else 'GRESKA' end);
  end if;
  perform public.oznaci_procitano(klijent);
  select count(*) into n from public.poruke where id = p_kl and procitano is not null;
  insert into rez (test, rezultat) values ('trener oznacava poruku klijenta procitanom', case when n = 1 then 'OK' else 'GRESKA' end);
  begin
    insert into public.poruke (klijent_id, autor_id, od_trenera, tekst) values (klijent, trener, true, 'hack');
    insert into rez (test, rezultat) values ('trener NE upisuje izravno (samo preko posluzitelja)', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('trener NE upisuje izravno (samo preko posluzitelja)', 'OK');
  end;

  -- DRUGI KORISNIK
  perform set_config('request.jwt.claims', json_build_object('sub', netko, 'role', 'authenticated')::text, true);
  select count(*) into n from public.poruke;
  insert into rez (test, rezultat) values ('nepoznati korisnik NE vidi poruke', case when n = 0 then 'OK' else 'GRESKA ' || n end);
  perform public.obrisi_pretplatu(ep);

  -- ANONIMNI
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform public.razgovori();
    insert into rez (test, rezultat) values ('anonimni NE vidi razgovore', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('anonimni NE vidi razgovore', 'OK');
  end;
  begin
    perform public.spremi_pretplatu(ep, 'k', 'a');
    insert into rez (test, rezultat) values ('anonimni NE sprema uredjaj', 'GRESKA - uspjelo');
  exception when others then
    insert into rez (test, rezultat) values ('anonimni NE sprema uredjaj', 'OK');
  end;

  execute 'reset role';
  select count(*) into n from public.push_pretplate where endpoint = ep;
  insert into rez (test, rezultat) values ('nepoznati korisnik NE brise tudji uredjaj', case when n = 1 then 'OK' else 'GRESKA' end);
  delete from public.push_pretplate where endpoint = ep;
  delete from public.poruke where id in (p_tr, p_kl, p_drugi);
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'poruke';
  insert into rez (test, rezultat) values ('poruke stizu odmah (realtime)', case when n = 1 then 'OK' else 'GRESKA' end);
end $$;

select test, rezultat from rez order by redoslijed;
