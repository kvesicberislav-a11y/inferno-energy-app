-- =====================================================================
-- Vježba u treningu iz kalendara može se potvrditi kao gotova i s manje
-- serija nego što je planirano (klijent se taj dan ne osjeća za više).
-- Plan (broj serija) ostaje zapisan; zavrsena = trener je potvrdio vježbu.
-- Kopiranje treninga ne prenosi ovu oznaku (kopiraj_trening navodi stupce).
-- =====================================================================

alter table public.trening_vjezbe
  add column if not exists zavrsena boolean not null default false;
