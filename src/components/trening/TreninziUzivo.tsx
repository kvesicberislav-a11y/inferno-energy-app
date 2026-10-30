"use client";

import { useEffect, useState } from "react";
import { Ploca } from "@/components/Ploca";
import { useRaspored } from "@/components/raspored/useRaspored";
import { useDanas } from "@/components/useDanas";
import { Kartica, Poruka, Ucitavanje } from "@/components/ui";
import { VideoVjezbe } from "@/components/vjezbe/VideoVjezbe";
import { dodajDane, opisDana } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import {
  SELECT_TRENINGA,
  nazivTreninga,
  serijeVjezbe,
  uTreningKalendara,
  type TreningKalendara,
  type TreningVjezba,
} from "@/lib/kalendar";
import { formatG } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { opisCilja, poSkupinama } from "@/lib/treninzi";

type Stanje = { kljuc: string; treninzi: TreningKalendara[]; greska: string | null };

/** Klijent uživo: treninzi koje mu je trener složio u kalendaru (samo pregled, upisuje trener). */
export function TreninziUzivo({ klijentId }: { klijentId: string }) {
  const danas = useDanas();
  const od = dodajDane(danas, -7);
  const doDana = dodajDane(danas, 14);
  const kljuc = `${klijentId}|${od}`;
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [otvoren, setOtvoren] = useState<string | null>(null);
  const [vjezba, setVjezba] = useState<{ t: TreningKalendara; tv: TreningVjezba } | null>(null);
  // plan vrijedi samo za dan na koji klijent stvarno ima termin (ne otkazan)
  const { raspored } = useRaspored(klijentId, od, doDana);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("treninzi")
      .select(SELECT_TRENINGA)
      .eq("klijent_id", klijentId)
      .eq("iz_kalendara", true)
      .gte("datum", od)
      .lte("datum", doDana)
      .order("datum")
      .then(({ data, error }) => {
        if (!aktivno) return;
        setStanje({
          kljuc,
          treninzi: (data ?? []).map(uTreningKalendara).filter((t) => t.vjezbe.length > 0 || t.skupine.length > 0),
          greska: error ? prevediGresku(error.message) : null,
        });
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId, od, doDana, kljuc]);

  if (stanje?.kljuc !== kljuc || !raspored) return <Ucitavanje />;
  if (stanje.greska) return <Poruka tip="greska">{stanje.greska}</Poruka>;

  const daniSTerminom = new Set(raspored.termini.filter((x) => !x.otkazan).map((x) => x.datum));
  // prošli trening s upisanim serijama ostaje vidljiv i ako je termin u međuvremenu promijenjen
  const vidljivi = stanje.treninzi.filter(
    (t) => daniSTerminom.has(t.datum) || (t.datum < danas && (t.zavrsen || t.serije.length > 0)),
  );
  const prosli = vidljivi.filter((t) => t.datum < danas);
  const nadolazeci = vidljivi.filter((t) => t.datum >= danas);
  const zadnjiProsli = prosli[prosli.length - 1] ?? null;
  // otvoren je današnji (ili prvi sljedeći) trening, dok klijent ne odabere drugi
  const prikazan = otvoren ?? nadolazeci[0]?.id ?? null;

  if (vidljivi.length === 0) {
    return (
      <Kartica>
        <p className="text-lg font-semibold">Još nema složenih treninga.</p>
        <p className="mt-1 text-tekst-2">Kad ti trener složi trening za termin, ovdje ćeš vidjeti vježbe, serije i kilažu.</p>
      </Kartica>
    );
  }

  const kartica = (t: TreningKalendara) => {
    const jeOtvoren = t.id === prikazan;
    const upisano = t.serije.filter((s) => s.plan_vjezba_id === null).length;
    return (
      <Kartica key={t.id} className="flex flex-col gap-3 p-4">
        <button type="button" onClick={() => setOtvoren(jeOtvoren ? "" : t.id)} className="flex items-start justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className={`block text-sm ${t.datum === danas ? "font-semibold text-vatra" : "text-tekst-2"}`}>
              {t.datum === danas ? "Danas · " : ""}
              {opisDana(t.datum)}
            </span>
            <span className="block text-lg font-bold">{nazivTreninga(t)}</span>
          </span>
          <span className="shrink-0 pt-1 text-sm text-tekst-2">
            {t.zavrsen ? "✓ odrađen" : upisano ? "u tijeku" : `${t.vjezbe.length} vježbi`} {jeOtvoren ? "▴" : "▾"}
          </span>
        </button>
        {jeOtvoren &&
          poSkupinama(t).map(({ skupina, vjezbe }) =>
            vjezbe.length === 0 ? null : (
              <section key={skupina} className="flex flex-col gap-2">
                <p className="text-xs font-bold tracking-wide text-tekst-2 uppercase">{skupina}</p>
                {vjezbe.map((tv) => {
                  const upisane = serijeVjezbe(t, tv.vjezba_id);
                  return (
                    <button
                      key={tv.id}
                      type="button"
                      onClick={() => setVjezba({ t, tv })}
                      className="flex w-full flex-col rounded-2xl border border-rub bg-povrsina-2 p-3 text-left active:scale-[0.99]"
                    >
                      <span className="leading-snug font-semibold">{tv.vjezba?.naziv ?? "Vježba"}</span>
                      <span className="text-sm text-tekst-2 tabular-nums">{opisCilja(tv)}</span>
                      {upisane.length > 0 && (
                        <span className="text-sm text-emerald-300 tabular-nums">
                          ✓ {upisane.map((s) => `${s.ponavljanja}×${formatG(s.kg)}`).join(", ")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </section>
            ),
          )}
      </Kartica>
    );
  };

  return (
    <>
      {nadolazeci.length === 0 ? (
        <Poruka>Sljedeći trening još nije složen.</Poruka>
      ) : (
        <div className="flex flex-col gap-3">{nadolazeci.map(kartica)}</div>
      )}
      {zadnjiProsli && (
        <>
          <p className="pt-2 text-sm font-semibold text-tekst-2">Zadnji trening</p>
          {kartica(zadnjiProsli)}
        </>
      )}

      {vjezba && (
        <Ploca naslov={vjezba.tv.vjezba?.naziv ?? "Vježba"} onZatvori={() => setVjezba(null)}>
          <div className="flex flex-col gap-4">
            <VideoVjezbe url={vjezba.tv.vjezba?.youtube_url ?? null} naslov={vjezba.tv.vjezba?.naziv ?? "Video"} />
            <div className="rounded-2xl bg-povrsina-2 px-4 py-3">
              <p className="text-sm text-tekst-2">Plan</p>
              <p className="text-xl font-bold tabular-nums">{opisCilja(vjezba.tv)}</p>
              {vjezba.tv.napomena && <p className="mt-1 text-sm text-amber-200">{vjezba.tv.napomena}</p>}
            </div>
            {serijeVjezbe(vjezba.t, vjezba.tv.vjezba_id).length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">Odrađeno</p>
                {serijeVjezbe(vjezba.t, vjezba.tv.vjezba_id).map((s) => (
                  <p key={s.id} className="text-tekst-2 tabular-nums">
                    {s.redni_broj}. serija: {s.ponavljanja} × {formatG(s.kg)} kg
                  </p>
                ))}
              </div>
            )}
            {vjezba.tv.vjezba?.opis && <p className="whitespace-pre-line text-tekst-2">{vjezba.tv.vjezba.opis}</p>}
          </div>
        </Ploca>
      )}
    </>
  );
}
