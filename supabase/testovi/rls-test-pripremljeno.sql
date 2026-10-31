-- Test pripremljenih podataka uz pozivnicu (prijenos pri registraciji). Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  p1 uuid;
  p2 uuid;
  v1 uuid;
  v2 uuid;
  v3 uuid;
  danas date := public.danas_zagreb();
  n int;
  d date;
  ok boolean;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v1 from public.vjezbe where vlasnik_id is null order by naziv limit 1;
  select id into v2 from public.vjezbe where vlasnik_id is null order by naziv offset 1 limit 1;
  select id into v3 from public.vjezbe where vlasnik_id is null and misicna_skupina <> (select misicna_skupina from public.vjezbe where id = v1) order by naziv limit 1;

  -- pozivnica s pripremljenim podacima (2 treninga, 1 stalni termin, 2 jednokratna od kojih je 1 prošao, 3 bazne od kojih 1 ne postoji)
  insert into public.pozivnice (ime, kreirao) values ('TEST prijenos', trener) returning id into p1;
  insert into public.pripremljeni_podaci (pozivnica_id, treninzi, termini, dodatni, bazne)
  values (p1,
    jsonb_build_array(
      jsonb_build_object('datum', '2026-03-02', 'vjezbe', jsonb_build_array(
        jsonb_build_object('vjezba_id', v1, 'redoslijed', 0, 'serije', 2, 'ponavljanja', '10', 'kg', 50,
          'odradeno', jsonb_build_array(jsonb_build_object('redni', 1, 'ponavljanja', 12, 'kg', 40), jsonb_build_object('redni', 2, 'ponavljanja', 10, 'kg', 50))),
        jsonb_build_object('vjezba_id', v3, 'redoslijed', 1, 'serije', 1, 'ponavljanja', '8', 'kg', 20,
          'odradeno', jsonb_build_array(jsonb_build_object('redni', 1, 'ponavljanja', 8, 'kg', 20))))),
      jsonb_build_object('datum', '2026-03-04', 'vjezbe', jsonb_build_array(
        jsonb_build_object('vjezba_id', v2, 'redoslijed', 0, 'serije', 1, 'ponavljanja', '6', 'kg', 0,
          'odradeno', jsonb_build_array(jsonb_build_object('redni', 1, 'ponavljanja', 6, 'kg', 0)))))),
    jsonb_build_array(jsonb_build_object('dan_u_tjednu', 3, 'vrijeme', '18:00', 'trajanje_min', 60, 'od_datuma', '2026-11-09')),
    jsonb_build_array(jsonb_build_object('datum', danas + 3, 'vrijeme', '10:00', 'trajanje_min', 45),
                      jsonb_build_object('datum', danas - 30, 'vrijeme', '10:00', 'trajanje_min', 60)),
    array[v1, v2, gen_random_uuid()]);

  -- RLS: trener čita, klijent ne vidi; nitko ne upisuje kroz aplikaciju
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.pripremljeni_podaci where pozivnica_id = p1;
  rez := rez || format(E'\n%s trener vidi pripremljene podatke', case when n = 1 then 'OK' else 'GRESKA' end);
  ok := false;
  begin
    insert into public.pripremljeni_podaci (pozivnica_id) values (p1);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s trener NE upisuje pripremljene kroz aplikaciju', case when ok then 'OK' else 'GRESKA' end);
  ok := false;
  begin
    perform public.prenesi_pripremljene_podatke(p1);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s trener NE pokreće prijenos ručno', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profili where uloga = 'klijent' order by kreirano limit 1), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.pripremljeni_podaci;
  rez := rez || format(E'\n%s klijent NE vidi pripremljene podatke', case when n = 0 then 'OK' else 'GRESKA' end);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- registracija: novi korisnik + /api/registracija upisuje iskoristio
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.prijenos1@primjer.hr', '{"ime":"Test Prijenos"}', now(), now());
  update public.pozivnice set iskoristena_at = now() where id = p1;
  update public.pozivnice set iskoristio = u1 where id = p1;

  select count(*) into n from public.treninzi where klijent_id = u1 and iz_kalendara and zavrsen and cardinality(skupine) >= 1;
  rez := rez || format(E'\n%s preneseni treninzi (2): %s', case when n = 2 then 'OK' else 'GRESKA' end, n);
  select count(*) into n from public.treninzi where klijent_id = u1 and datum = '2026-03-02' and cardinality(skupine) = 2;
  rez := rez || format(E'\n%s skupine prvog treninga (2): %s', case when n = 1 then 'OK' else 'GRESKA' end, n);
  select count(*) into n from public.trening_vjezbe tv join public.treninzi t on t.id = tv.trening_id where t.klijent_id = u1;
  rez := rez || format(E'\n%s vježbe treninga (3): %s', case when n = 3 then 'OK' else 'GRESKA' end, n);
  select count(*) into n from public.odradjene_serije where klijent_id = u1;
  rez := rez || format(E'\n%s serije (4): %s', case when n = 4 then 'OK' else 'GRESKA' end, n);
  select count(*) into n from public.bazne_vjezbe where klijent_id = u1;
  rez := rez || format(E'\n%s bazne bez nepostojeće (2): %s', case when n = 2 then 'OK' else 'GRESKA' end, n);
  select od_datuma into d from public.termini_pravila where klijent_id = u1 and dan_u_tjednu = 3 and vrijeme = '18:00';
  rez := rez || format(E'\n%s stalni termin od %s', case when d = greatest(danas, '2026-11-09'::date) then 'OK' else 'GRESKA' end, d);
  select count(*) into n from public.termini_dodatni where klijent_id = u1;
  rez := rez || format(E'\n%s jednokratni bez prošlog (1): %s', case when n = 1 then 'OK' else 'GRESKA' end, n);
  select count(*) into n from public.pripremljeni_podaci where pozivnica_id = p1 and prenesen_at is not null and greska is null;
  rez := rez || format(E'\n%s označeno kao preneseno', case when n = 1 then 'OK' else 'GRESKA' end);
  rez := rez || format(E'\n%s drugi prijenos ne radi ništa', case when public.prenesi_pripremljene_podatke(p1) = 0 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.kilaze_klijenta(u1) where max_kg = 50;
  rez := rez || format(E'\n%s najveća kilaža se vidi treneru (50 kg)', case when n = 1 then 'OK' else 'GRESKA' end);

  -- novi klijent vidi svoje preneseno, ali ga ne može mijenjati
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.odradjene_serije;
  rez := rez || format(E'\n%s klijent vidi svoje serije (4): %s', case when n = 4 then 'OK' else 'GRESKA' end, n);
  delete from public.treninzi where klijent_id = u1;
  get diagnostics n = row_count;
  rez := rez || format(E'\n%s klijent NE briše treninge iz kalendara', case when n = 0 then 'OK' else 'GRESKA' end);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- neispravni podaci: registracija prolazi, ništa se ne prenese, greška ostaje zapisana
  insert into public.pozivnice (ime, kreirao) values ('TEST greška', trener) returning id into p2;
  insert into public.pripremljeni_podaci (pozivnica_id, treninzi, termini)
  values (p2,
    jsonb_build_array(jsonb_build_object('datum', '2026-03-02', 'vjezbe', jsonb_build_array(
      jsonb_build_object('vjezba_id', v1, 'redoslijed', 0, 'serije', 0, 'ponavljanja', '10', 'kg', 50, 'odradeno', '[]'::jsonb)))),
    jsonb_build_array(jsonb_build_object('dan_u_tjednu', 2, 'vrijeme', '08:00', 'trajanje_min', 60)));
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.prijenos2@primjer.hr', '{"ime":"Test Greska"}', now(), now());
  update public.pozivnice set iskoristena_at = now(), iskoristio = u2 where id = p2;
  select count(*) into n from public.pozivnice where id = p2 and iskoristio = u2;
  rez := rez || format(E'\n%s registracija prolazi i kad prijenos padne', case when n = 1 then 'OK' else 'GRESKA' end);
  select (select count(*) from public.treninzi where klijent_id = u2) + (select count(*) from public.termini_pravila where klijent_id = u2) into n;
  rez := rez || format(E'\n%s ništa se ne prenese napola: %s', case when n = 0 then 'OK' else 'GRESKA' end, n);
  select count(*) into n from public.pripremljeni_podaci where pozivnica_id = p2 and prenesen_at is null and greska is not null;
  rez := rez || format(E'\n%s greška zapisana, podaci ostaju za ponovni pokušaj', case when n = 1 then 'OK' else 'GRESKA' end);

  -- brisanje pozivnice briše i pripremljene podatke
  delete from public.pozivnice where id = p2;
  select count(*) into n from public.pripremljeni_podaci where pozivnica_id = p2;
  rez := rez || format(E'\n%s brisanje pozivnice briše pripremljene', case when n = 0 then 'OK' else 'GRESKA' end);

  raise exception 'REZULTAT:%', rez;
end $$;
