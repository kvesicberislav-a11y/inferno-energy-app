"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Zasticeno } from "@/components/Zasticeno";
import { Cip, Gumb, Poruka, Stranica, Ucitavanje } from "@/components/ui";
import { SlicicaVjezbe } from "@/components/vjezbe/VideoVjezbe";
import { VjezbaForma } from "@/components/vjezbe/VjezbaForma";
import { filtrirajVjezbe, useVjezbe } from "@/components/vjezbe/useVjezbe";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import { MISICNE_SKUPINE, youtubeId, type Vjezba } from "@/lib/treninzi";

/** "1 vježba", "3 vježbe", "5 vježbi" */
function brojVjezbi(n: number) {
  const z = n % 10;
  const zz = n % 100;
  return `${n} ${z === 1 && zz !== 11 ? "vježba" : z >= 2 && z <= 4 && (zz < 12 || zz > 14) ? "vježbe" : "vježbi"}`;
}

function BibliotekaVjezbi() {
  const { vjezbe, greska, osvjezi } = useVjezbe();
  const [upit, setUpit] = useState("");
  const [skupina, setSkupina] = useState<string | null>(null);
  const [forma, setForma] = useState<{ vjezba: Vjezba | null } | null>(null);
  // premještanje više vježbi u drugu mišićnu skupinu (null = obični pregled)
  const [odabir, setOdabir] = useState<Set<string> | null>(null);
  const [biranjeSkupine, setBiranjeSkupine] = useState(false);
  const [obavijest, setObavijest] = useState<string | null>(null);

  const prikazane = vjezbe ? filtrirajVjezbe(vjezbe, upit, skupina) : [];
  const sveOznacene = odabir !== null && prikazane.length > 0 && prikazane.every((v) => odabir.has(v.id));

  function oznaci(v: Vjezba) {
    setOdabir((o) => {
      const n = new Set(o);
      if (n.has(v.id)) n.delete(v.id);
      else n.add(v.id);
      return n;
    });
  }

  function oznaciPrikazane() {
    setOdabir((o) => {
      const n = new Set(o);
      for (const v of prikazane) {
        if (sveOznacene) n.delete(v.id);
        else n.add(v.id);
      }
      return n;
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl font-bold">Vježbe</h1>
        {odabir === null ? (
          <div className="flex gap-2">
            <Gumb
              malen
              varijanta="sporedni"
              onClick={() => {
                setObavijest(null);
                setOdabir(new Set());
              }}
              disabled={!vjezbe?.length}
            >
              Premjesti
            </Gumb>
            <Gumb malen onClick={() => setForma({ vjezba: null })}>
              + Nova vježba
            </Gumb>
          </div>
        ) : (
          <Gumb malen varijanta="sporedni" onClick={() => setOdabir(null)}>
            Odustani
          </Gumb>
        )}
      </div>

      {odabir !== null && (
        <p className="-mt-1 text-sm text-tekst-2">
          Označi vježbe koje želiš premjestiti u drugu mišićnu skupinu (možeš mijenjati filter i pretragu).
        </p>
      )}
      {obavijest && <Poruka tip="uspjeh">{obavijest}</Poruka>}

      <input
        type="search"
        aria-label="Pretraži vježbe"
        placeholder="Pretraži…"
        value={upit}
        onChange={(e) => setUpit(e.target.value)}
        className="h-12 w-full rounded-2xl border border-rub bg-povrsina px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
      />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Cip aktivan={skupina === null} onClick={() => setSkupina(null)}>
          Sve
        </Cip>
        {MISICNE_SKUPINE.map((s) => (
          <Cip key={s} aktivan={skupina === s} onClick={() => setSkupina(skupina === s ? null : s)}>
            {s}
          </Cip>
        ))}
      </div>

      {odabir !== null && (
        <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-rub bg-pozadina/95 px-4 py-2 backdrop-blur">
          <span className="min-w-0 flex-1 text-sm">
            Označeno: <strong className="tabular-nums">{odabir.size}</strong>
          </span>
          <button
            type="button"
            onClick={oznaciPrikazane}
            disabled={prikazane.length === 0}
            className="text-sm font-semibold text-vatra disabled:opacity-40"
          >
            {sveOznacene ? "Odznači prikazane" : `Označi prikazane (${prikazane.length})`}
          </button>
          <Gumb malen onClick={() => setBiranjeSkupine(true)} disabled={odabir.size === 0}>
            Premjesti u…
          </Gumb>
        </div>
      )}

      {greska && <Poruka tip="greska">{greska}</Poruka>}

      {vjezbe === null ? (
        !greska && <Ucitavanje />
      ) : vjezbe.length === 0 ? (
        <Poruka>Biblioteka je prazna. Dodaj prvu vježbu gumbom „+ Nova vježba”.</Poruka>
      ) : prikazane.length === 0 ? (
        <Poruka>Nijedna vježba ne odgovara pretrazi.</Poruka>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-tekst-2">{prikazane.length} vježbi</p>
          {prikazane.map((v) => {
            const oznacena = odabir?.has(v.id) ?? false;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => (odabir ? oznaci(v) : setForma({ vjezba: v }))}
                aria-pressed={odabir ? oznacena : undefined}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left active:scale-[0.99] ${
                  oznacena ? "border-vatra bg-vatra/10" : "border-rub bg-povrsina"
                }`}
              >
                {odabir && (
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base font-bold ${
                      oznacena ? "bg-vatra text-white" : "border border-rub text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                )}
                <SlicicaVjezbe slikaUrl={v.slika_url} youtubeUrl={v.youtube_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{v.naziv}</p>
                  <p className="text-sm text-tekst-2">
                    {v.misicna_skupina}
                    {youtubeId(v.youtube_url) ? " · ▶ video" : ""}
                  </p>
                </div>
                {!odabir && (
                  <span className="text-2xl text-tekst-2" aria-hidden="true">
                    ›
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {forma && (
        <VjezbaForma
          postojeca={forma.vjezba}
          onZatvori={() => setForma(null)}
          onSpremljeno={() => {
            setForma(null);
            osvjezi();
          }}
        />
      )}

      {biranjeSkupine && odabir && vjezbe && (
        <PremjestiUSkupinu
          oznacene={vjezbe.filter((v) => odabir.has(v.id))}
          onZatvori={() => setBiranjeSkupine(false)}
          onPremjesteno={(poruka) => {
            setBiranjeSkupine(false);
            setOdabir(null);
            setObavijest(poruka);
            osvjezi();
          }}
        />
      )}
    </>
  );
}

/** Odabir mišićne skupine u koju se premještaju označene vježbe (vrijedi za sve klijente). */
function PremjestiUSkupinu({
  oznacene,
  onZatvori,
  onPremjesteno,
}: {
  oznacene: Vjezba[];
  onZatvori: () => void;
  onPremjesteno: (poruka: string) => void;
}) {
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  async function premjesti(cilj: string) {
    const ids = oznacene.filter((v) => v.misicna_skupina !== cilj).map((v) => v.id);
    if (ids.length === 0) return onZatvori();
    if (!window.confirm(`Premjestiti ${brojVjezbi(ids.length)} u „${cilj}”?`)) return;
    setGreska(null);
    setRadi(true);
    const { data, error } = await supabase().from("vjezbe").update({ misicna_skupina: cilj }).in("id", ids).select("id");
    setRadi(false);
    if (error) return setGreska(prevediGresku(error.message));
    const n = data?.length ?? 0;
    if (n < ids.length) return setGreska(`Premješteno je samo ${brojVjezbi(n)} od ${ids.length}. Pokušaj ponovno.`);
    onPremjesteno(`Premješteno: ${brojVjezbi(n)} u „${cilj}”.`);
  }

  return (
    <Ploca naslov={`Premjesti ${brojVjezbi(oznacene.length)} u…`} onZatvori={onZatvori}>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-tekst-2">Vježbe se premještaju u biblioteci – vrijedi za sve klijente i treninge.</p>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {MISICNE_SKUPINE.map((s) => {
          const vec = oznacene.filter((v) => v.misicna_skupina === s).length;
          return (
            <button
              key={s}
              type="button"
              onClick={() => premjesti(s)}
              disabled={radi}
              className="flex h-12 w-full items-center justify-between rounded-2xl border border-rub bg-povrsina-2 px-4 text-left font-semibold active:scale-[0.99] disabled:opacity-50"
            >
              {s}
              {vec > 0 && <span className="text-sm font-normal text-tekst-2">{vec === oznacene.length ? "već su ovdje" : `${vec} već ovdje`}</span>}
            </button>
          );
        })}
      </div>
    </Ploca>
  );
}

export default function TrenerVjezbeStranica() {
  return (
    <Zasticeno uloga="trener">
      <Stranica>
        <Zaglavlje />
        <BibliotekaVjezbi />
      </Stranica>
    </Zasticeno>
  );
}
