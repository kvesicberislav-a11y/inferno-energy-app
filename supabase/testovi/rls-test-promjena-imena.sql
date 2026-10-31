-- Test promjene imena klijenta. Na kraju se sve PONIŠTAVA (raise).
do $$
declare
  trener uuid;
  k uuid := gen_random_uuid();
  drugi uuid := gen_random_uuid();
  n int;
  ok boolean;
  vraceno text;
  rez text := '';
begin
  select id into trener from public.profili where uloga = 'trener' and aktivan order by kreirano limit 1;
  insert into public.profili (id, ime, registriran) values (k, 'TEST Judita', false);
  insert into public.profili (id, ime, registriran) values (drugi, 'TEST Drugi', false);
  insert into public.pozivnice (ime, kreirao, profil_id) values ('TEST Judita', trener, k);

  -- trener doda prezime (višak razmaka se čisti)
  perform set_config('request.jwt.claims', json_build_object('sub', trener, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  vraceno := public.promijeni_ime_klijenta(k, '  TEST Judita   Horvat ');
  rez := rez || format(E'\n%s trener promijeni ime: %s', case when vraceno = 'TEST Judita Horvat' then 'OK' else 'GRESKA' end, vraceno);
  select count(*) into n from public.profili where id = k and ime = 'TEST Judita Horvat';
  rez := rez || format(E'\n%s novo ime je na profilu', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.pozivnice where profil_id = k and ime = 'TEST Judita Horvat';
  rez := rez || format(E'\n%s novo ime je i na pozivnici', case when n = 1 then 'OK' else 'GRESKA' end);
  select count(*) into n from public.profili where id = drugi and ime = 'TEST Drugi';
  rez := rez || format(E'\n%s drugi klijent ostaje isti', case when n = 1 then 'OK' else 'GRESKA' end);

  -- prazno ime i trener se ne mogu preimenovati
  ok := false;
  begin
    perform public.promijeni_ime_klijenta(k, '   ');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s prazno ime se odbija', case when ok then 'OK' else 'GRESKA' end);
  ok := false;
  begin
    perform public.promijeni_ime_klijenta(trener, 'Netko Drugi');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s ime trenera se ne mijenja ovdje', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  -- klijent ne smije mijenjati ime (ni svoje ni tuđe)
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  ok := false;
  begin
    perform public.promijeni_ime_klijenta(drugi, 'Hakirano Ime');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE mijenja tuđe ime', case when ok then 'OK' else 'GRESKA' end);
  ok := false;
  begin
    update public.profili set ime = 'Hakirano Ime' where id = k;
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s klijent NE mijenja svoje ime izravno', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  -- neprijavljeni (anon) ne može pozvati funkciju
  execute 'set local role anon';
  ok := false;
  begin
    perform public.promijeni_ime_klijenta(k, 'Anon Ime');
  exception when others then ok := true;
  end;
  rez := rez || format(E'\n%s neprijavljeni NE mijenja ime', case when ok then 'OK' else 'GRESKA' end);
  execute 'reset role';

  raise exception 'REZULTAT:%', rez;
end $$;
