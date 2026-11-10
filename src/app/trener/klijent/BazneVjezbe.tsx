"use client";

import { useState, type FormEvent } from "react";
import { Ploca } from "@/components/Ploca";
import { Cip, Gumb, Kartica, Polje, Poruka, Ucitavanje } from "@/components/ui";
import { SerijeUnos, planIzRedova, redoviIzPlana, type RedSerije } from "@/components/trening/SerijeUnos";
import { kratkoMaxIliPolazno, kratkoNajvise, najvecaKg, useBazneIKilaze } from "@/components/trening/useBazneIKilaze";
import { filtrirajVjezbe, useVjezbe } from "@/components/vjezbe/useVjezbe";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { MISICNE_SKUPINE, opisSerija, type Kilaza, type PodaciBazne, type Vjezba } from "@/lib/treninzi";

/** Trener: bazne vježbe klijenta – od njih se slaže njegov program. */
export function BazneVjezbe({ klijentId, ime }: { klijentId: string; ime: string }) {
  const { ucitano, bazne, podaci, kilaze, greska, osvjezi } = useBazneIKilaze(klijentId);
  const { vjezbe } = useVjezbe({ vrsta: "sve" });
  const [uredivanje, setUredivanje] = useState(false);
  const [otvorena, setOtvorena] = useState<Vjezba | null>(null);

  const njegove = (vjezbe ?? []).filter((v) => bazne.has(v.id));
  const poSkupini = MISICNE_SKUPINE.map((s) => ({ s, vjezbe: njegove.filter((v) => v.misicna_skupina === s) })).filter(
    (x) => x.vjezbe.length > 0,
  );

  return (
    <>
      <Kartica className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Bazne vježbe</h3>
            <p className="text-sm text-tekst-2">
              Vježbe koje {ime.split(" ")[0]} preferira. Dodirni vježbu i upiši serije (ponavljanja × kg) i stalnu napomenu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUredivanje(true)}
            disabled={!ucitano || vjezbe === null}
            className="shrink-0 text-sm font-semibold text-vatra disabled:opacity-40"
          >
            {bazne.size ? "Uredi" : "+ Dodaj"}
          </button>
        </div>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {!ucitano || vjezbe === null ? (
          <p className="text-sm text-tekst-2">Učitavam…</p>
        ) : njegove.length === 0 ? (
          <p className="text-sm text-tekst-2">Još nema baznih vježbi.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {poSkupini.map(({ s, vjezbe: uSkupini }) => (
              <section key={s} className="flex flex-col gap-1.5">
                <p className="text-xs font-bold tracking-wide text-tekst-2 uppercase">
                  {s} · {uSkupini.length}
                </p>
                {uSkupini.map((v) => {
                  const p = podaci.get(v.id);
                  const max = kratkoNajvise(kilaze.get(v.id), p);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setOtvorena(v)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-rub bg-povrsina-2 p-3 text-left active:scale-[0.99]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block leading-snug font-semibold">{v.naziv}</span>
                        {p?.serije_plan ? (
                          <span className="block text-sm text-tekst-2 tabular-nums">{opisSerija(p.serije_plan)}</span>
                        ) : (
                          <span className="block text-sm text-zinc-500">upiši serije</span>
                        )}
                        {max && <span className="block truncate text-xs text-tekst-2">{max}</span>}
                        {p?.napomena && <span className="block truncate text-xs text-amber-200">📌 {p.napomena}</span>}
                      </span>
                      <span className="shrink-0 text-xl text-tekst-2" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </Kartica>

      {uredivanje && (
        <UrediBazne
          klijentId={klijentId}
          vjezbe={vjezbe}
          bazne={bazne}
          podaci={podaci}
          kilaze={kilaze}
          onPromjena={osvjezi}
          onZatvori={() => setUredivanje(false)}
        />
      )}

      {otvorena && (
        <BaznaVjezbaForma
          key={otvorena.id}
          klijentId={klijentId}
          ime={ime}
          vjezba={otvorena}
          pocetno={podaci.get(otvorena.id) ?? null}
          kilaza={kilaze.get(otvorena.id) ?? null}
          onSpremljeno={() => {
            setOtvorena(null);
            osvjezi();
          }}
          onZatvori={() => setOtvorena(null)}
        />
      )}
    </>
  );
}

/** Bazne serije (ponavljanja × kg za svaku seriju) i stalna napomena klijenta za jednu vježbu. */
function BaznaVjezbaForma({
  klijentId,
  ime,
  vjezba,
  pocetno,
  kilaza,
  onSpremljeno,
  onZatvori,
}: {
  klijentId: string;
  ime: string;
  vjezba: Vjezba;
  pocetno: PodaciBazne | null;
  kilaza: Kilaza | null;
  onSpremljeno: () => void;
  onZatvori: () => void;
}) {
  const [redovi, setRedovi] = useState<RedSerije[]>(() => redoviIzPlana(pocetno?.serije_plan, 3));
  const [napomena, setNapomena] = useState(pocetno?.napomena ?? "");
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);
  const max = kratkoNajvise(kilaza, pocetno);

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    const r = planIzRedova(redovi);
    if ("greska" in r) return setGreska(r.greska);
    setSalje(true);
    const { error } = await supabase()
      .from("bazne_vjezbe")
      // ručni upis: bazne više ne ovise o treningu iz kojeg su se zadnji put osvježile
      .update({
        serije_plan: r.plan.length ? r.plan : null,
        napomena: napomena.trim().slice(0, 300),
        izvor_trening: null,
        serije_prije: null,
      })
      .eq("klijent_id", klijentId)
      .eq("vjezba_id", vjezba.id);
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    onSpremljeno();
  }

  return (
    <Ploca naslov={vjezba.naziv} onZatvori={onZatvori}>
      <form onSubmit={spremi} className="flex flex-col gap-5">
        {max && (
          <div className="rounded-2xl bg-povrsina-2 px-4 py-3 text-sm text-tekst-2">Max: {max.replace(/^max /, "")}</div>
        )}
        <SerijeUnos redovi={redovi} onPromjena={setRedovi} maxKg={najvecaKg(kilaza, pocetno)} />
        <p className="-mt-3 text-xs text-tekst-2">
          Ove serije se nude kad mu slažeš trening u kalendaru. Kad na treningu digne više kila, ovdje se same osvježe.
          Prazne redove preskačem.
        </p>
        <Polje
          id="bazna-napomena"
          oznaka="📌 Stalna napomena (neobavezno)"
          placeholder="npr. sjedalo lvl3, gurat se o spužvu"
          maxLength={300}
          value={napomena}
          onChange={(e) => setNapomena(e.target.value)}
        />
        <p className="-mt-3 text-xs text-tekst-2">Pojavljuje se uz ovu vježbu na svakom treningu. Vidi je i {ime.split(" ")[0]}.</p>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <Gumb type="submit" disabled={salje}>
          {salje ? "Spremam…" : "Spremi"}
        </Gumb>
      </form>
    </Ploca>
  );
}

function UrediBazne({
  klijentId,
  vjezbe,
  bazne,
  podaci,
  kilaze,
  onPromjena,
  onZatvori,
}: {
  klijentId: string;
  vjezbe: Vjezba[] | null;
  bazne: Set<string>;
  podaci: Map<string, PodaciBazne>;
  kilaze: Map<string, Kilaza>;
  onPromjena: () => void;
  onZatvori: () => void;
}) {
  // lokalno stanje da kvačica reagira odmah (sprema se u pozadini)
  const [odabrane, setOdabrane] = useState<Set<string>>(() => new Set(bazne));
  const [skupina, setSkupina] = useState<string | null>(MISICNE_SKUPINE[0]);
  const [upit, setUpit] = useState("");
  const [samoNjegove, setSamoNjegove] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const dostupne = (vjezbe ?? []).filter((v) => v.vlasnik_id === null || v.vlasnik_id === klijentId);
  const prikazane = filtrirajVjezbe(dostupne, upit, upit ? null : skupina).filter((v) => !samoNjegove || odabrane.has(v.id));

  async function promijeni(v: Vjezba) {
    const bila = odabrane.has(v.id);
    const p = podaci.get(v.id);
    if (
      bila &&
      p &&
      (p.serije_plan || p.napomena) &&
      !window.confirm(`Maknuti „${v.naziv}” iz baznih vježbi? Obrisat će se i upisane serije i stalna napomena.`)
    ) {
      return;
    }
    setOdabrane((o) => {
      const n = new Set(o);
      if (bila) n.delete(v.id);
      else n.add(v.id);
      return n;
    });
    setGreska(null);
    const sb = supabase().from("bazne_vjezbe");
    const { error } = bila
      ? await sb.delete().eq("klijent_id", klijentId).eq("vjezba_id", v.id)
      : await sb.upsert({ klijent_id: klijentId, vjezba_id: v.id }, { ignoreDuplicates: true });
    if (error) {
      setGreska(prevediGresku(error.message));
      setOdabrane((o) => {
        const n = new Set(o);
        if (bila) n.add(v.id);
        else n.delete(v.id);
        return n;
      });
      return;
    }
    onPromjena();
  }

  return (
    <Ploca naslov={`Bazne vježbe (${odabrane.size})`} onZatvori={onZatvori}>
      <div className="flex flex-col gap-3">
        <input
          type="search"
          aria-label="Pretraži vježbe"
          placeholder="Pretraži sve vježbe…"
          value={upit}
          onChange={(e) => setUpit(e.target.value)}
          className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
        />
        {!upit && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {MISICNE_SKUPINE.map((s) => {
              const n = dostupne.filter((v) => v.misicna_skupina === s && odabrane.has(v.id)).length;
              return (
                <Cip key={s} aktivan={skupina === s} onClick={() => setSkupina(s)}>
                  {s}
                  {n ? ` · ${n}` : ""}
                </Cip>
              );
            })}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-tekst-2">
          <input type="checkbox" checked={samoNjegove} onChange={(e) => setSamoNjegove(e.target.checked)} className="h-5 w-5 accent-vatra" />
          Prikaži samo odabrane
        </label>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {vjezbe === null ? (
          <Ucitavanje />
        ) : prikazane.length === 0 ? (
          <Poruka>Nema vježbi.</Poruka>
        ) : (
          <div className="flex flex-col gap-2">
            {prikazane.map((v) => {
              const da = odabrane.has(v.id);
              const max = kratkoMaxIliPolazno(kilaze.get(v.id), podaci.get(v.id));
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => promijeni(v)}
                  aria-pressed={da}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                    da ? "border-vatra bg-vatra/10" : "border-rub bg-povrsina-2"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base font-bold ${
                      da ? "bg-vatra text-white" : "border border-rub text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug font-semibold">{v.naziv}</span>
                    {(max || upit || v.vlasnik_id) && (
                      <span className="block text-sm text-tekst-2">
                        {[upit ? v.misicna_skupina : null, max, v.vlasnik_id ? "njegova vježba" : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Ploca>
  );
}
