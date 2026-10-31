-- Test dodavanja klijenta bez računa. Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid;
  k2 uuid;
  n int;
  ok boolean;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;

  -- trener doda klijenta
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  k := public.dodaj_klijenta('  TEST   Novi Klijent ');
  select count(*) into n from public.profili
   where id = k and ime = 'TEST Novi Klijent' and uloga = 'klijent' and nacin = 'uzivo'
     and not registriran and aktivan and boja is not null;
  rez := rez || format(E'\n%s trener doda klijenta (uživo, bez računa, s bojom)', case when n = 1 then 'OK' else 'GRESKA' end);
  k2 := public.dodaj_klijenta('TEST Online Klijent', 'online');
  select count(*) into n from public.profili where id = k2 and nacin = 'online';
  rez := rez || format(E'\n%s trener doda online klijenta', case when n = 1 then 'OK' else 'GRESKA' end);
  -- odmah mu može dodati termin
  insert into public.termini_dodatni (klijent_id, datum, vrijeme, trajanje_min)
  values (k, public.danas_zagreb() + 1, '18:00', 60);
  select count(*) into n from public.termini_dodatni where klijent_id = k;
  rez := rez || format(E'\n%s novom klijentu se odmah doda termin', case when n = 1 then 'OK' else 'GRESKA' end);
  -- i pozivnicu vezanu uz njega
  insert into public.pozivnice (ime, profil_id) values ('TEST Novi Klijent', k);
  select count(*) into n from public.pozivnice where profil_id = k and kreirao = trener;
  rez := rez || format(E'\n%s pozivnica vezana uz novog klijenta', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.pregled_klijenata(p_klijent => k);
  rez := rez || format(E'\n%s novi klijent je u pregledu klijenata', case when n = 1 then 'OK' else 'GRESKA' end);

  ok := false;
  begin
    perform public.dodaj_klijenta(' ');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s prazno ime se odbija', case when ok then 'OK' else 'GRESKA' end);
  ok := false;
  begin
    perform public.dodaj_klijenta('TEST Krivo', 'nesto');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s neispravan način se odbija', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  -- klijent ne može dodavati klijente
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    perform public.dodaj_klijenta('TEST Uljez');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE dodaje klijente', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  execute 'set local role anon';
  ok := false;
  begin
    perform public.dodaj_klijenta('TEST Anon');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s neprijavljeni NE dodaje klijente', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  raise exception 'REZULTAT:%', rez;
end $$;
