-- Test trajnog brisanja klijenta. Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  p uuid := gen_random_uuid();   -- klijent bez računa, s podacima
  p2 uuid := gen_random_uuid();  -- drugi klijent koji koristi p-ovu vježbu
  r uuid := gen_random_uuid();   -- klijent s računom
  e1 uuid;
  e2 uuid;
  tr uuid;
  slike text[];
  n int;
  ok boolean;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;

  insert into public.profili (id, ime, registriran) values (p, 'TEST Brisanje', false), (p2, 'TEST Ostaje', false);
  insert into public.vjezbe (naziv, misicna_skupina, vlasnik_id) values ('TEST vlastita 1', 'Prsa', p) returning id into e1;
  insert into public.vjezbe (naziv, misicna_skupina, vlasnik_id) values ('TEST vlastita 2', 'Prsa', p) returning id into e2;
  insert into public.treninzi (klijent_id, datum, iz_kalendara, zavrsen) values (p, '2026-03-02', true, true) returning id into tr;
  insert into public.trening_vjezbe (trening_id, vjezba_id) values (tr, e1);
  insert into public.odradjene_serije (klijent_id, trening_id, vjezba_id, redni_broj, ponavljanja, kg) values (p, tr, e1, 1, 10, 50);
  insert into public.treninzi (klijent_id, datum, iz_kalendara, zavrsen) values (p2, '2026-03-02', true, true) returning id into tr;
  insert into public.trening_vjezbe (trening_id, vjezba_id) values (tr, e2);
  insert into public.termini_dodatni (klijent_id, datum, vrijeme) values (p, '2026-03-02', '10:00'), (p2, '2026-03-02', '11:00');
  insert into public.slike_napretka (klijent_id, datum, poza, putanja) values (p, '2026-03-02', 'sprijeda', p::text || '/test.jpg');
  insert into public.pozivnice (ime, kreirao, profil_id) values ('TEST Brisanje', trener, p);

  -- klijent ne smije brisati
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profili where uloga = 'klijent' and registriran order by kreirano limit 1), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    perform public.obrisi_klijenta(p2);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE može brisati klijente', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  -- trener briše
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    perform public.obrisi_klijenta(trener);
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s trener NE može obrisati trenera', case when ok then 'OK' else 'GRESKA' end);
  slike := public.obrisi_klijenta(p);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  rez := rez || format(E'\n%s vraća putanje slika (1)', case when slike = array[p::text || '/test.jpg'] then 'OK' else 'GRESKA' end);
  select (select count(*) from public.profili where id = p) + (select count(*) from public.treninzi where klijent_id = p)
       + (select count(*) from public.odradjene_serije where klijent_id = p) + (select count(*) from public.termini_dodatni where klijent_id = p)
       + (select count(*) from public.slike_napretka where klijent_id = p) + (select count(*) from public.pozivnice where profil_id = p)
    into n;
  rez := rez || format(E'\n%s obrisan klijent i svi njegovi podaci: ostalo %s', case when n = 0 then 'OK' else 'GRESKA' end, n);
  select count(*) into n from public.vjezbe where id = e1;
  rez := rez || format(E'\n%s njegova vježba koju nitko drugi ne koristi je obrisana', case when n = 0 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.vjezbe where id = e2 and vlasnik_id is null;
  rez := rez || format(E'\n%s vježba koju koristi drugi klijent ostaje (zajednička)', case when n = 1 then 'OK' else 'GRESKA' end);
  select (select count(*) from public.treninzi where klijent_id = p2) + (select count(*) from public.termini_dodatni where klijent_id = p2) into n;
  rez := rez || format(E'\n%s drugi klijent netaknut (2): %s', case when n = 2 then 'OK' else 'GRESKA' end, n);

  -- klijent s računom: briše se i račun
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (r, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test.brisanje@primjer.hr', '{"ime":"Test Racun"}', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.obrisi_klijenta(r);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select (select count(*) from auth.users where id = r) + (select count(*) from public.profili where id = r) into n;
  rez := rez || format(E'\n%s klijentu s računom obrisan i račun', case when n = 0 then 'OK' else 'GRESKA' end);

  raise exception 'REZULTAT:%', rez;
end $$;
