-- =====================================================================
-- BRISANJE JEDNOG TERMINA iz stalnog termina: termin nestaje iz kalendara
-- (za razliku od otkazanog, koji ostaje precrtan da klijent vidi da je otkazan)
-- =====================================================================
alter table public.termini_iznimke
  add column obrisan boolean not null default false,
  add constraint termini_iznimke_obrisan_je_otkazan check (not obrisan or otkazan);
