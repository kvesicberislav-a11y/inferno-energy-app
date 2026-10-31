-- Test klijenta bez računa (spajanje računa pri registraciji). Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  p uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  p3 uuid := gen_random_uuid();
  q uuid := gen_random_uuid();
  poz uuid;
  poz3 uuid;
  v1 uuid;
  n int;
  ok boolean;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  select id into v1 from public.vjezbe where vlasnik_id is null order by naziv limit 1;

  -- klijent bez računa, s terminom i pozivnicom
  insert into public.profili (id, ime, registriran) values (p, 'TEST Bez Računa', false);
  select count(*) into n from public.profili pr
   where pr.id = p and pr.uloga = 'klijent' and not pr.registriran and pr.boja is not null
     and not exists (select 1 from auth.users u where u.id = p);
  rez := rez || format(E'\n%s klijent postoji bez računa (i dobije boju)', case when n = 1 then 'OK' else 'GRESKA' end);
  insert into public.termini_dodatni (klijent_id, datum, vrijeme) values (p, public.danas_zagreb() + 2, '10:00');
  insert into public.pozivnice (ime, kreirao, profil_id) values ('TEST Bez Računa', trener, p) returning id into poz;

  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.pregled_klijenata(p_klijent => p);
  rez := rez || format(E'\n%s trener vidi klijenta bez računa', case when n = 1 then 'OK' else 'GRESKA' end);
  ok := false;
  begin
    insert into public.pozivnice (ime, profil_id) values ('TEST druga', p);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s nema dvije otvorene pozivnice za istog klijenta', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- registracija preko pozivnice: račun dobiva isti id
  update public.pozivnice set iskoristena_at = now() where id = poz;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (p, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.bezracuna@primjer.hr', '{"ime":"Test Puno Ime"}', now(), now());
  update public.pozivnice set iskoristio = p where id = poz;
  select count(*) into n from public.profili
   where id = p and registriran and email = 'test.bezracuna@primjer.hr' and ime = 'Test Puno Ime' and uloga = 'klijent';
  rez := rez || format(E'\n%s račun spojen s postojećim klijentom', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.termini_dodatni where klijent_id = p;
  rez := rez || format(E'\n%s podaci ostaju (termin): %s', case when n = 1 then 'OK' else 'GRESKA' end, n);

  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.termini_dodatni;
  rez := rez || format(E'\n%s klijent nakon registracije vidi svoj termin', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.profili;
  rez := rez || format(E'\n%s klijent vidi samo svoj profil', case when n = 1 then 'OK' else 'GRESKA' end);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- profil koji već ima račun ne može se preuzeti novim računom
  insert into public.profili (id, ime, registriran) values (p2, 'TEST Registriran', true);
  ok := false;
  begin
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (p2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.preuzimanje@primjer.hr', '{}', now(), now());
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s registrirani profil se NE može preuzeti', case when ok then 'OK' else 'GRESKA' end);

  -- obična registracija (bez veze) i dalje stvara novi profil
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (q, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.obicna@primjer.hr', '{"ime":"Test Obican"}', now(), now());
  select count(*) into n from public.profili where id = q and registriran and uloga = 'klijent' and ime = 'Test Obican';
  rez := rez || format(E'\n%s obična registracija stvara novog klijenta', case when n = 1 then 'OK' else 'GRESKA' end);

  -- brisanje računa i dalje briše profil
  delete from auth.users where id = q;
  select count(*) into n from public.profili where id = q;
  rez := rez || format(E'\n%s brisanje računa briše profil', case when n = 0 then 'OK' else 'GRESKA' end);

  -- pripremljeni podaci odmah na klijenta bez računa
  insert into public.profili (id, ime, registriran) values (p3, 'TEST Prijenos Bez Računa', false);
  insert into public.pozivnice (ime, kreirao, profil_id) values ('TEST Prijenos Bez Računa', trener, p3) returning id into poz3;
  insert into public.pripremljeni_podaci (pozivnica_id, treninzi, dodatni)
  values (poz3,
    jsonb_build_array(jsonb_build_object('datum', '2026-03-02', 'vjezbe', jsonb_build_array(
      jsonb_build_object('vjezba_id', v1, 'redoslijed', 0, 'serije', 1, 'ponavljanja', '10', 'kg', 40,
        'odradeno', jsonb_build_array(jsonb_build_object('redni', 1, 'ponavljanja', 10, 'kg', 40)))))),
    jsonb_build_array(jsonb_build_object('datum', '2026-03-02', 'vrijeme', '18:00', 'trajanje_min', 60)));
  rez := rez || format(E'\n%s prijenos na klijenta bez računa (1 trening)',
    case when public.prenesi_pripremljene_podatke(poz3) = 1 then 'OK' else 'GRESKA' end);
  select (select count(*) from public.odradjene_serije where klijent_id = p3) + (select count(*) from public.termini_dodatni where klijent_id = p3) into n;
  rez := rez || format(E'\n%s serija i prošli termin preneseni (2): %s', case when n = 2 then 'OK' else 'GRESKA' end, n);
  select count(*) into n from public.pozivnice where id = poz3 and iskoristena_at is null;
  rez := rez || format(E'\n%s pozivnica i dalje čeka registraciju', case when n = 1 then 'OK' else 'GRESKA' end);

  raise exception 'REZULTAT:%', rez;
end $$;
