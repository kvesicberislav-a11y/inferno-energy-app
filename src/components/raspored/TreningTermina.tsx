"use client";

import { useEffect, useState } from "react";
import { DodajVjezbe } from "@/app/trener/plan/DodajVjezbe";
import { PlanVjezbaForma, type PodaciPlanVjezbe } from "@/app/trener/plan/PlanVjezbaForma";
import { SkupineForma } from "@/app/trener/plan/SkupineForma";
import { Ploca } from "@/components/Ploca";
import { kratkoMax, useBazneIKilaze } from "@/components/trening/useBazneIKilaze";
import { Gumb, Poruka, Ucitavanje } from "@/components/ui";
import { danMjesec, danasZagreb } from "@/lib/datum";
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
import { opisTermina, type Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { opisCilja, poSkupinama, type Vjezba } from "@/lib/treninzi";
import { KopirajTrening } from "./KopirajTrening";
import { UpisSerija } from "./UpisSerija";

type Stanje = { kljuc: string; trening: TreningKalendara | null; greska: string | null };

/**
 * Trening jednog termina (klijent uživo, jedan datum).
 * „Plan”: mišićne skupine → vježbe s najboljim rezultatom klijenta → serije × ponavljanja × kg.
 * „Trening”: trener upisuje što je klijent stvarno odradio.
 */
export function TreningTermina({
  termin,
  ime,
  onPromjena,
  onTermin,
  onZatvori,
}: {
  termin: Termin;
  ime: string;
  /** nešto je promijenjeno – kalendar osvježi oznake */
  onPromjena: () => void;
  /** otvori radnje termina (pomakni / obriši) */
  onTermin: () => void;
  onZatvori: () => void;
}) {
  const klijentId = termin.klijentId;
  const datum = termin.datum;
  const kljuc = `${klijentId}|${datum}`;
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [verzija, setVerzija] = useState(0);
  const { bazne, kilaze, osvjezi: osvjeziKilaze } = useBazneIKilaze(klijentId);
  const [nacin, setNacin] = useState<"plan" | "trening">(datum === danasZagreb() ? "trening" : "plan");
  const [skupineOtvorene, setSkupineOtvorene] = useState(false);
  const [dodavanje, setDodavanje] = useState<string | null>(null);
  const [forma, setForma] = useState<TreningVjezba | null>(null);
  const [upis, setUpis] = useState<TreningVjezba | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [obavijest, setObavijest] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const [kopiranje, setKopiranje] = useState(false);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("treninzi")
      .select(SELECT_TRENINGA)
      .eq("klijent_id", klijentId)
      .eq("datum", datum)
      .eq("iz_kalendara", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!aktivno) return;
        setStanje({
          kljuc,
          trening: data ? uTreningKalendara(data) : null,
          greska: error ? prevediGresku(error.message) : null,
        });
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId, datum, kljuc, verzija]);

  const sb = supabase();
  const trening = stanje?.kljuc === kljuc ? stanje.trening : null;

  function osvjezi() {
    setVerzija((v) => v + 1);
    onPromjena();
  }

  async function izvrsi(radnja: PromiseLike<{ error: { message: string } | null }>) {
    setGreska(null);
    setRadi(true);
    const { error } = await radnja;
    setRadi(false);
    if (error) {
      const g = prevediGresku(error.message);
      setGreska(g);
      return g;
    }
    osvjezi();
    return null;
  }

  /** Trening za ovaj datum (napravi ga ako ga još nema). */
  async function osigurajTrening(skupine: string[]): Promise<string> {
    if (trening) return trening.id;
    const { data, error } = await sb
      .from("treninzi")
      .insert({ klijent_id: klijentId, datum, naziv: nazivTreninga({ skupine }).slice(0, 60), skupine, iz_kalendara: true })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Trening nije spremljen.");
    return String(data.id);
  }

  async function spremiSkupine(skupine: string[]) {
    setGreska(null);
    try {
      if (trening) {
        const g = await izvrsi(
          sb.from("treninzi").update({ skupine, naziv: nazivTreninga({ skupine }).slice(0, 60) }).eq("id", trening.id),
        );
        if (g) return g;
      } else {
        await osigurajTrening(skupine);
        osvjezi();
      }
      setSkupineOtvorene(false);
      return null;
    } catch (e) {
      return prevediGresku(e instanceof Error ? e.message : null);
    }
  }

  async function dodajVjezbe(vjezbe: Vjezba[]) {
    try {
      const id = await osigurajTrening(trening?.skupine ?? (dodavanje ? [dodavanje] : []));
      const pocetak = (trening?.vjezbe ?? []).reduce((m, v) => Math.max(m, v.redoslijed), -1) + 1;
      const redovi = vjezbe.map((v, i) => {
        // prijedlog = njegov najbolji rezultat (trener ga ostavi ili promijeni)
        const k = kilaze.get(v.id);
        return {
          trening_id: id,
          vjezba_id: v.id,
          redoslijed: pocetak + i,
          serije: k?.maxSerija && k.maxSerija > 0 ? Math.min(20, k.maxSerija) : 3,
          ponavljanja: String(k?.maxPonavljanja && k.maxPonavljanja > 0 ? k.maxPonavljanja : 10),
          kg: k?.maxKg ?? null,
        };
      });
      const { error } = await sb.from("trening_vjezbe").insert(redovi);
      if (error) return prevediGresku(error.message);
      const nove = vjezbe.filter((v) => !bazne.has(v.id));
      if (nove.length) {
        await sb
          .from("bazne_vjezbe")
          .upsert(nove.map((v) => ({ klijent_id: klijentId, vjezba_id: v.id })), { ignoreDuplicates: true });
        osvjeziKilaze();
      }
      setDodavanje(null);
      osvjezi();
      return null;
    } catch (e) {
      return prevediGresku(e instanceof Error ? e.message : null);
    }
  }

  async function spremiVjezbu(tv: TreningVjezba, p: PodaciPlanVjezbe) {
    const g = await izvrsi(sb.from("trening_vjezbe").update(p).eq("id", tv.id));
    if (!g) setForma(null);
    return g;
  }

  async function ukloniVjezbu(tv: TreningVjezba) {
    const g = await izvrsi(sb.from("trening_vjezbe").delete().eq("id", tv.id));
    if (!g) setForma(null);
    return g;
  }

  /** Pomak vježbe gore/dolje unutar njene skupine. */
  function pomak(tv: TreningVjezba, smjer: -1 | 1): (() => void) | null {
    if (!trening) return null;
    const skupine = poSkupinama(trening);
    const s = skupine.find((x) => x.vjezbe.some((v) => v.id === tv.id));
    if (!s) return null;
    const i = s.vjezbe.findIndex((v) => v.id === tv.id);
    const j = i + smjer;
    if (j < 0 || j >= s.vjezbe.length) return null;
    return async () => {
      [s.vjezbe[i], s.vjezbe[j]] = [s.vjezbe[j], s.vjezbe[i]];
      const redom = skupine.flatMap((x) => x.vjezbe);
      setRadi(true);
      const rez = await Promise.all(
        redom
          .map((v, k) => ({ v, k }))
          .filter(({ v, k }) => v.redoslijed !== k)
          .map(({ v, k }) => sb.from("trening_vjezbe").update({ redoslijed: k }).eq("id", v.id)),
      );
      setRadi(false);
      const prva = rez.find((r) => r.error);
      if (prva?.error) setGreska(prevediGresku(prva.error.message));
      setForma(null);
      osvjezi();
    };
  }

  /** Klijent nije došao (ili ipak jest). Plan ostaje; trening bez plana se pri poništavanju briše. */
  async function oznaciNijeDosao(da: boolean) {
    if (trening) {
      const prazan = !trening.skupine.length && !trening.vjezbe.length;
      await izvrsi(
        !da && prazan
          ? sb.from("treninzi").delete().eq("id", trening.id)
          : sb.from("treninzi").update({ nije_dosao: da }).eq("id", trening.id),
      );
    } else if (da) {
      await izvrsi(
        sb.from("treninzi").insert({ klijent_id: klijentId, datum, naziv: "", skupine: [], iz_kalendara: true, nije_dosao: true }),
      );
    }
  }

  async function zavrsi(zavrsen: boolean) {
    if (!trening) return;
    await izvrsi(
      sb.from("treninzi").update({ zavrsen, zavrseno_at: zavrsen ? new Date().toISOString() : null }).eq("id", trening.id),
    );
  }

  const imaPlan = Boolean(trening && (trening.skupine.length || trening.vjezbe.length));
  const upisanih = trening?.serije.filter((s) => s.plan_vjezba_id === null).length ?? 0;

  return (
    <Ploca naslov={ime} onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`font-semibold ${termin.otkazan ? "text-tekst-2 line-through" : ""}`}>{opisTermina(termin)}</p>
            <p className="text-sm text-tekst-2">
              {termin.trajanje} min{termin.otkazan ? " · otkazan" : ""}
              {trening?.skupine.length ? ` · ${nazivTreninga(trening)}` : ""}
            </p>
          </div>
          <Gumb varijanta="sporedni" malen onClick={onTermin}>
            Termin ›
          </Gumb>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-rub bg-povrsina-2 p-1" role="group" aria-label="Način">
          {(
            [
              ["plan", "Plan"],
              ["trening", "Trening (upis)"],
            ] as const
          ).map(([k, o]) => (
            <button
              key={k}
              type="button"
              onClick={() => setNacin(k)}
              aria-pressed={nacin === k}
              className={`h-10 rounded-xl text-sm font-semibold transition ${nacin === k ? "bg-vatra text-white" : "text-tekst-2"}`}
            >
              {o}
            </button>
          ))}
        </div>

        {(stanje?.greska || greska) && <Poruka tip="greska">{stanje?.greska ?? greska}</Poruka>}
        {obavijest && <Poruka tip="uspjeh">{obavijest}</Poruka>}

        {trening?.nijeDosao && (
          <div className="flex flex-col gap-2 rounded-2xl border border-zinc-600 bg-zinc-700/40 p-4">
            <p className="font-semibold">✗ {ime.split(" ")[0]} nije došao na ovaj trening.</p>
            <p className="text-sm text-tekst-2">
              Ne ulazi u statistiku.{imaPlan ? " Plan je spremljen – na sljedećem treningu ga kopiraj s „Kopiraj plan”." : ""}
            </p>
            <button
              type="button"
              onClick={() => oznaciNijeDosao(false)}
              disabled={radi}
              className="self-start text-sm text-tekst-2 underline"
            >
              Ipak je došao
            </button>
          </div>
        )}

        {stanje?.kljuc !== kljuc ? (
          <Ucitavanje />
        ) : trening?.nijeDosao && nacin === "trening" ? null : !imaPlan ? (
          <div className="flex flex-col gap-3">
            <p className="text-tekst-2">
              {nacin === "plan" ? "Još nema plana za ovaj trening." : "Nema plana. Prebaci na „Plan” i dodaj vježbe."}
            </p>
            {nacin === "plan" && (
              <>
                <Gumb onClick={() => setSkupineOtvorene(true)} disabled={radi}>
                  + Mišićne skupine
                </Gumb>
                <Gumb varijanta="sporedni" onClick={() => setKopiranje(true)} disabled={radi}>
                  Kopiraj plan s drugog treninga
                </Gumb>
              </>
            )}
          </div>
        ) : (
          <>
            {poSkupinama(trening!).map(({ skupina, vjezbe }) => (
              <section key={skupina} className="flex flex-col gap-2">
                <p className="text-xs font-bold tracking-wide text-tekst-2 uppercase">{skupina}</p>
                {vjezbe.map((tv) => {
                  const upisane = serijeVjezbe(trening!, tv.vjezba_id);
                  const gotovo = upisane.length >= tv.serije;
                  const max = kratkoMax(kilaze.get(tv.vjezba_id));
                  return (
                    <button
                      key={tv.id}
                      type="button"
                      onClick={() => (nacin === "plan" ? setForma(tv) : setUpis(tv))}
                      className={`flex w-full items-center gap-3 rounded-2xl border bg-povrsina-2 p-3 text-left active:scale-[0.99] ${
                        nacin === "trening" && gotovo ? "border-emerald-500/40" : "border-rub"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block leading-snug font-semibold">{tv.vjezba?.naziv ?? "Vježba"}</span>
                        <span className="block text-sm text-tekst-2 tabular-nums">{opisCilja(tv)}</span>
                        {nacin === "plan"
                          ? max && <span className="block truncate text-xs text-tekst-2">{max}</span>
                          : upisane.length > 0 && (
                              <span className="block truncate text-xs text-emerald-300 tabular-nums">
                                {upisane.map((s) => `${s.ponavljanja}×${formatG(s.kg)}`).join(", ")}
                              </span>
                            )}
                      </span>
                      {nacin === "trening" ? (
                        <span
                          className={`shrink-0 rounded-xl px-2.5 py-1 text-sm font-semibold tabular-nums ${
                            gotovo ? "bg-emerald-500/20 text-emerald-300" : "bg-povrsina text-tekst-2"
                          }`}
                        >
                          {gotovo ? "✓" : `${upisane.length}/${tv.serije}`}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xl text-tekst-2" aria-hidden="true">
                          ›
                        </span>
                      )}
                    </button>
                  );
                })}
                {nacin === "plan" && (
                  <button
                    type="button"
                    disabled={radi}
                    onClick={() => setDodavanje(skupina)}
                    className="flex h-11 items-center justify-center rounded-2xl border border-dashed border-rub text-sm font-semibold text-vatra active:scale-[0.99] disabled:opacity-50"
                  >
                    + {skupina}
                  </button>
                )}
              </section>
            ))}

            {nacin === "plan" ? (
              <div className="grid grid-cols-2 gap-2">
                <Gumb varijanta="sporedni" malen onClick={() => setSkupineOtvorene(true)} disabled={radi}>
                  Skupine
                </Gumb>
                <Gumb varijanta="sporedni" malen onClick={() => setKopiranje(true)} disabled={radi}>
                  Kopiraj plan
                </Gumb>
              </div>
            ) : trening!.zavrsen ? (
              <div className="flex flex-col gap-2">
                <Poruka tip="uspjeh">Trening je završen. 💪</Poruka>
                <button type="button" onClick={() => zavrsi(false)} className="self-center text-sm text-tekst-2 underline">
                  Ipak nije završen
                </button>
              </div>
            ) : (
              <Gumb onClick={() => zavrsi(true)} disabled={radi || upisanih === 0}>
                {upisanih === 0 ? "Upiši serije (dodirni vježbu)" : "Završi trening"}
              </Gumb>
            )}
          </>
        )}

        {stanje?.kljuc === kljuc && !trening?.nijeDosao && !trening?.zavrsen && upisanih === 0 && (
          <Gumb varijanta="sporedni" malen onClick={() => oznaciNijeDosao(true)} disabled={radi}>
            ✗ Nije došao
          </Gumb>
        )}
      </div>

      {skupineOtvorene && (
        <SkupineForma
          naslov={`${ime.split(" ")[0]} · ${danMjesec(datum)}`}
          pocetne={trening?.skupine ?? []}
          onSpremi={spremiSkupine}
          onZatvori={() => setSkupineOtvorene(false)}
        />
      )}
      {dodavanje && (
        <DodajVjezbe
          skupina={dodavanje}
          klijentId={klijentId}
          bazne={bazne}
          kilaze={kilaze}
          vecUDanu={trening?.vjezbe.map((v) => v.vjezba_id) ?? []}
          onDodaj={dodajVjezbe}
          onZatvori={() => setDodavanje(null)}
        />
      )}
      {forma?.vjezba && (
        <PlanVjezbaForma
          mjesto="trening"
          vjezba={forma.vjezba}
          pocetno={forma}
          kilaza={kilaze.get(forma.vjezba_id) ?? null}
          onZatvori={() => setForma(null)}
          onSpremi={(p) => spremiVjezbu(forma, p)}
          onUkloni={() => ukloniVjezbu(forma)}
          onPomakni={{ gore: pomak(forma, -1), dolje: pomak(forma, 1) }}
        />
      )}
      {kopiranje && (
        <KopirajTrening
          klijentId={klijentId}
          datum={datum}
          zamijeni={Boolean(trening?.vjezbe.length)}
          onKopirano={(poruka) => {
            setKopiranje(false);
            setObavijest(poruka);
            osvjezi();
          }}
          onZatvori={() => setKopiranje(false)}
        />
      )}
      {upis && trening && (
        <UpisSerija
          klijentId={klijentId}
          treningId={trening.id}
          tv={upis}
          spremljene={serijeVjezbe(trening, upis.vjezba_id)}
          kilaza={kilaze.get(upis.vjezba_id) ?? null}
          onPromjena={osvjezi}
          onZatvori={() => {
            setUpis(null);
            osvjeziKilaze();
          }}
        />
      )}
    </Ploca>
  );
}
