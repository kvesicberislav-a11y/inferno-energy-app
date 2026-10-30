"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { kratkoMax, useBazneIKilaze } from "@/components/trening/useBazneIKilaze";
import { useDanas } from "@/components/useDanas";
import { Gumb, Kartica, Polje, Poruka, Ucitavanje } from "@/components/ui";
import { danMjesec, ponedjeljak } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";
import {
  DANI,
  NAJVISE_TJEDANA,
  SELECT_PLANA,
  pocetakZaTjedan,
  poSkupinama,
  tjedanCiklusa,
  uPlan,
  type Plan,
  type PlanDan,
  type PlanVjezba,
  type Vjezba,
} from "@/lib/treninzi";
import { DodajVjezbe } from "./DodajVjezbe";
import { KgKoraci } from "./KgKoraci";
import { PlanVjezbaForma, type PodaciPlanVjezbe } from "./PlanVjezbaForma";
import { SkupineForma } from "./SkupineForma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Klijent = { id: string; ime: string };
type Ucitano = { id: string; plan: Plan | null; klijent: Klijent | null; greska: string | null };

/** Uređivanje programa klijenta: ciklus → tjedan → dan → mišićne skupine → vježbe s kilažom. */
export function UredivacPlana() {
  const id = useSearchParams().get("id") ?? "";
  const ispravan = UUID.test(id);
  const danas = useDanas();
  const [ucitano, setUcitano] = useState<Ucitano | null>(null);
  const [verzija, setVerzija] = useState(0);
  const [odabraniTjedan, setOdabraniTjedan] = useState<number | null>(null);
  const [skupineZa, setSkupineZa] = useState<{ dan: PlanDan | null; danUTjednu: number } | null>(null);
  const [dodavanjeZa, setDodavanjeZa] = useState<{ dan: PlanDan; skupina: string } | null>(null);
  const [forma, setForma] = useState<{ dan: PlanDan; pv: PlanVjezba } | null>(null);
  const [uredivanjeNaziva, setUredivanjeNaziva] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  useEffect(() => {
    if (!ispravan) return;
    let aktivno = true;
    supabase()
      .from("planovi")
      .select(`${SELECT_PLANA}, klijent:profili(id, ime, email)`)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!aktivno) return;
        const k = data ? ((Array.isArray(data.klijent) ? data.klijent[0] : data.klijent) as Record<string, unknown> | null) : null;
        setUcitano({
          id,
          plan: data ? uPlan(data) : null,
          klijent: k ? { id: String(k.id), ime: String(k.ime || k.email || "Klijent") } : null,
          greska: error ? prevediGresku(error.message) : null,
        });
      });
    return () => {
      aktivno = false;
    };
  }, [id, ispravan, verzija]);

  const klijentId = ucitano?.id === id ? (ucitano.klijent?.id ?? null) : null;
  const { bazne, kilaze, osvjezi: osvjeziBazne } = useBazneIKilaze(klijentId);

  const osvjezi = () => setVerzija((v) => v + 1);

  const natrag = (
    <Link
      href={klijentId ? `/trener/klijent?id=${klijentId}&kartica=treninzi` : "/trener"}
      className="self-start py-2 text-base font-medium text-vatra"
    >
      ‹ {ucitano?.klijent?.ime ?? "Klijenti"}
    </Link>
  );

  if (ispravan && ucitano?.id !== id) return <Ucitavanje />;
  const plan = ispravan ? ucitano?.plan : null;
  if (!plan) {
    return (
      <>
        {natrag}
        <Poruka tip="greska">{ucitano?.greska ?? "Program nije pronađen."}</Poruka>
      </>
    );
  }

  const ciklus = plan.ciklus_tjedana;
  const trenutni = tjedanCiklusa(plan, danas);
  const tjedan = Math.min(odabraniTjedan ?? trenutni, ciklus);
  const daniTjedna = plan.dani.filter((d) => d.tjedan === tjedan);
  const sb = supabase();

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

  /** Kilaža promijenjena gumbima −/+ (bez ponovnog učitavanja cijelog programa). */
  function postaviKgLokalno(pvId: string, kg: number | null) {
    setUcitano((u) =>
      u?.plan
        ? {
            ...u,
            plan: {
              ...u.plan,
              dani: u.plan.dani.map((d) => ({ ...d, vjezbe: d.vjezbe.map((v) => (v.id === pvId ? { ...v, kg } : v)) })),
            },
          }
        : u,
    );
  }

  async function promijeniCiklus(n: number) {
    if (n === ciklus) return;
    const visak = plan!.dani.filter((d) => d.tjedan > n);
    if (visak.length && !window.confirm(`Tjedni iza ${n}. imaju ${visak.length} treninga koji će se obrisati. Nastaviti?`)) {
      return;
    }
    if (visak.length) {
      const g = await izvrsi(sb.from("plan_dani").delete().eq("plan_id", plan!.id).gt("tjedan", n));
      if (g) return;
    }
    // Novi ciklus kreće ovaj tjedan od 1. tjedna
    await izvrsi(
      sb.from("planovi").update({ ciklus_tjedana: n, pocetak: ponedjeljak(danas) }).eq("id", plan!.id),
    );
    setOdabraniTjedan(null);
  }

  async function postaviTrenutniTjedan(k: number) {
    if (k === trenutni) return;
    await izvrsi(sb.from("planovi").update({ pocetak: pocetakZaTjedan(danas, k) }).eq("id", plan!.id));
  }

  async function kopirajTjedan(u: number) {
    const imaTreninga = plan!.dani.some((d) => d.tjedan === u);
    const pitanje = imaTreninga
      ? `Tjedan ${u} već ima treninge. Zamijeniti ih kopijom tjedna ${tjedan}?`
      : `Kopirati tjedan ${tjedan} u tjedan ${u}?`;
    if (!window.confirm(pitanje)) return;
    const g = await izvrsi(sb.rpc("kopiraj_tjedan", { p_plan: plan!.id, p_iz: tjedan, p_u: u }));
    if (!g) setOdabraniTjedan(u);
  }

  async function spremiSkupine(skupine: string[]) {
    if (!skupineZa) return null;
    const g = skupineZa.dan
      ? await izvrsi(sb.from("plan_dani").update({ skupine }).eq("id", skupineZa.dan.id))
      : await izvrsi(
          sb.from("plan_dani").insert({ plan_id: plan!.id, tjedan, dan_u_tjednu: skupineZa.danUTjednu, skupine }),
        );
    if (!g) setSkupineZa(null);
    return g;
  }

  async function ukloniDan(dan: PlanDan) {
    if (!window.confirm(`Ukloniti trening (${DANI[dan.dan_u_tjednu - 1].toLowerCase()}) s vježbama?`)) return;
    await izvrsi(sb.from("plan_dani").delete().eq("id", dan.id));
  }

  async function dodajVjezbe(dan: PlanDan, vjezbe: Vjezba[]) {
    const pocetak = dan.vjezbe.reduce((m, v) => Math.max(m, v.redoslijed), -1) + 1;
    const redovi = vjezbe.map((v, i) => ({
      plan_dan_id: dan.id,
      vjezba_id: v.id,
      redoslijed: pocetak + i,
      serije: 3,
      ponavljanja: "10",
      // trener kreće od najveće kilaže klijenta pa je spusti ili digne
      kg: kilaze.get(v.id)?.maxKg ?? null,
    }));
    const g = await izvrsi(sb.from("plan_vjezbe").insert(redovi));
    if (g) return g;
    const noveBazne = vjezbe.filter((v) => !bazne.has(v.id));
    if (klijentId && noveBazne.length) {
      await sb
        .from("bazne_vjezbe")
        .upsert(noveBazne.map((v) => ({ klijent_id: klijentId, vjezba_id: v.id })), { ignoreDuplicates: true });
      osvjeziBazne();
    }
    setDodavanjeZa(null);
    return null;
  }

  async function spremiVjezbu(pv: PlanVjezba, p: PodaciPlanVjezbe) {
    const g = await izvrsi(sb.from("plan_vjezbe").update(p).eq("id", pv.id));
    if (!g) setForma(null);
    return g;
  }

  async function ukloniVjezbu(pv: PlanVjezba) {
    const g = await izvrsi(sb.from("plan_vjezbe").delete().eq("id", pv.id));
    if (!g) setForma(null);
    return g;
  }

  /** Pomak vježbe gore/dolje unutar njene skupine; redoslijed dana se zapiše iznova. */
  function pomak(dan: PlanDan, pv: PlanVjezba, smjer: -1 | 1): (() => void) | null {
    const skupine = poSkupinama(dan);
    const s = skupine.find((x) => x.vjezbe.some((v) => v.id === pv.id));
    if (!s) return null;
    const i = s.vjezbe.findIndex((v) => v.id === pv.id);
    const j = i + smjer;
    if (j < 0 || j >= s.vjezbe.length) return null;
    return async () => {
      [s.vjezbe[i], s.vjezbe[j]] = [s.vjezbe[j], s.vjezbe[i]];
      const redom = skupine.flatMap((x) => x.vjezbe);
      setGreska(null);
      setRadi(true);
      const rezultati = await Promise.all(
        redom
          .map((v, k) => ({ v, k }))
          .filter(({ v, k }) => v.redoslijed !== k)
          .map(({ v, k }) => sb.from("plan_vjezbe").update({ redoslijed: k }).eq("id", v.id)),
      );
      setRadi(false);
      const prva = rezultati.find((r) => r.error);
      if (prva?.error) setGreska(prevediGresku(prva.error.message));
      setForma(null);
      osvjezi();
    };
  }

  return (
    <>
      {natrag}

      {uredivanjeNaziva ? (
        <NazivPlanaForma
          plan={plan}
          onGotovo={() => {
            setUredivanjeNaziva(false);
            osvjezi();
          }}
          onOdustani={() => setUredivanjeNaziva(false)}
        />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-tekst-2">Program{ucitano?.klijent ? ` · ${ucitano.klijent.ime}` : ""}</p>
            <h1 className="text-2xl font-bold">{plan.naziv}</h1>
            {plan.opis && <p className="mt-1 whitespace-pre-line text-tekst-2">{plan.opis}</p>}
          </div>
          <Gumb varijanta="sporedni" malen onClick={() => setUredivanjeNaziva(true)}>
            Uredi
          </Gumb>
        </div>
      )}

      <Kartica className="flex flex-col gap-3">
        <div>
          <p className="font-semibold">Ciklus</p>
          <p className="text-sm text-tekst-2">Koliko tjedana se program vrti prije nego krene ispočetka?</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: NAJVISE_TJEDANA }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={radi}
              onClick={() => promijeniCiklus(n)}
              aria-pressed={n === ciklus}
              className={`h-11 rounded-xl text-sm font-semibold transition ${
                n === ciklus ? "bg-vatra text-white" : "border border-rub bg-povrsina-2 text-tekst-2"
              }`}
            >
              {n} {n === 1 ? "tjedan" : "tjedna"}
            </button>
          ))}
        </div>
        {ciklus === 1 ? (
          <p className="text-sm text-tekst-2">Svaki tjedan je isti. Kilažu mijenjaš gumbima − / + kod vježbe.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-tekst-2">Ovaj tjedan ({danMjesec(ponedjeljak(danas))}) klijent radi:</p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: ciklus }, (_, i) => i + 1).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={radi}
                  onClick={() => postaviTrenutniTjedan(k)}
                  className={`h-9 rounded-xl px-3 text-sm font-semibold ${
                    k === trenutni ? "bg-emerald-500/20 text-emerald-200" : "border border-rub bg-povrsina-2 text-tekst-2"
                  }`}
                >
                  {k}. tjedan
                </button>
              ))}
            </div>
          </div>
        )}
      </Kartica>

      {greska && <Poruka tip="greska">{greska}</Poruka>}

      {ciklus > 1 && (
        <div className="flex flex-col gap-2">
          <div
            className="grid gap-1 rounded-2xl border border-rub bg-povrsina p-1"
            style={{ gridTemplateColumns: `repeat(${ciklus}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: ciklus }, (_, i) => i + 1).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setOdabraniTjedan(k)}
                className={`flex h-12 flex-col items-center justify-center rounded-xl text-sm font-semibold transition ${
                  k === tjedan ? "bg-povrsina-2 text-tekst shadow" : "text-tekst-2"
                }`}
              >
                <span>{k}. tjedan</span>
                {k === trenutni && <span className="text-[10px] font-medium text-emerald-300">ovaj tjedan</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-tekst-2">
            <span>Kopiraj {tjedan}. tjedan u:</span>
            {Array.from({ length: ciklus }, (_, i) => i + 1)
              .filter((k) => k !== tjedan)
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={radi || daniTjedna.length === 0}
                  onClick={() => kopirajTjedan(k)}
                  className="h-9 rounded-xl border border-rub bg-povrsina-2 px-3 font-semibold text-tekst disabled:opacity-40"
                >
                  {k}. tjedan
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {DANI.map((imeDana, i) => {
          const danUTjednu = i + 1;
          const dan = daniTjedna.find((d) => d.dan_u_tjednu === danUTjednu);
          if (!dan) {
            return (
              <div
                key={danUTjednu}
                className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-rub px-4 py-3"
              >
                <span className="text-tekst-2">
                  <strong className="font-semibold text-tekst">{imeDana}</strong> · odmor
                </span>
                <Gumb varijanta="sporedni" malen disabled={radi} onClick={() => setSkupineZa({ dan: null, danUTjednu })}>
                  + Trening
                </Gumb>
              </div>
            );
          }
          return (
            <Kartica key={danUTjednu} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-bold">{imeDana}</p>
                  <p className="text-sm text-tekst-2">
                    {dan.skupine.join(" · ") || "Bez skupina"} · {dan.vjezbe.length}{" "}
                    {dan.vjezbe.length === 1 ? "vježba" : dan.vjezbe.length > 1 && dan.vjezbe.length < 5 ? "vježbe" : "vježbi"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-4 pt-1">
                  <button type="button" onClick={() => setSkupineZa({ dan, danUTjednu })} className="text-sm font-semibold text-vatra">
                    Skupine
                  </button>
                  <button type="button" onClick={() => ukloniDan(dan)} className="text-sm text-red-300">
                    Ukloni
                  </button>
                </div>
              </div>

              {dan.skupine.length === 0 && dan.vjezbe.length === 0 && (
                <Gumb varijanta="sporedni" onClick={() => setSkupineZa({ dan, danUTjednu })}>
                  Odaberi mišićne skupine
                </Gumb>
              )}

              {poSkupinama(dan).map(({ skupina, vjezbe }) => (
                <section key={skupina} className="flex flex-col gap-2">
                  <p className="text-xs font-bold tracking-wide text-tekst-2 uppercase">{skupina}</p>
                  {vjezbe.map((pv) => (
                    <div key={pv.id} className="flex items-center gap-2 rounded-2xl border border-rub bg-povrsina-2 p-2">
                      <button
                        type="button"
                        onClick={() => setForma({ dan, pv })}
                        className="min-w-0 flex-1 px-1 text-left active:opacity-70"
                      >
                        <p className="line-clamp-2 leading-snug font-semibold">{pv.vjezba?.naziv ?? "Vježba"}</p>
                        <p className="truncate text-sm text-tekst-2 tabular-nums">
                          {pv.serije} × {pv.ponavljanja.replace(/\s*-\s*/g, "–")}
                          {pv.napomena ? ` · ${pv.napomena}` : ""}
                        </p>
                        {kratkoMax(kilaze.get(pv.vjezba_id)) && (
                          <p className="truncate text-xs text-tekst-2">{kratkoMax(kilaze.get(pv.vjezba_id))}</p>
                        )}
                      </button>
                      <KgKoraci
                        key={`${pv.id}|${pv.kg ?? ""}`}
                        planVjezbaId={pv.id}
                        kg={pv.kg}
                        maxKg={kilaze.get(pv.vjezba_id)?.maxKg ?? null}
                        onSpremljeno={(kg) => postaviKgLokalno(pv.id, kg)}
                        onGreska={setGreska}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={radi}
                    onClick={() => setDodavanjeZa({ dan, skupina })}
                    className="flex h-11 items-center justify-center rounded-2xl border border-dashed border-rub text-sm font-semibold text-vatra active:scale-[0.99] disabled:opacity-50"
                  >
                    + {skupina}
                  </button>
                </section>
              ))}
            </Kartica>
          );
        })}
      </div>

      {skupineZa && (
        <SkupineForma
          naslov={`${DANI[skupineZa.danUTjednu - 1]}${ciklus > 1 ? ` · ${tjedan}. tjedan` : ""}`}
          pocetne={skupineZa.dan?.skupine ?? []}
          onSpremi={spremiSkupine}
          onZatvori={() => setSkupineZa(null)}
        />
      )}

      {dodavanjeZa && (
        <DodajVjezbe
          skupina={dodavanjeZa.skupina}
          klijentId={klijentId}
          bazne={bazne}
          kilaze={kilaze}
          vecUDanu={dodavanjeZa.dan.vjezbe.map((v) => v.vjezba_id)}
          onDodaj={(v) => dodajVjezbe(dodavanjeZa.dan, v)}
          onZatvori={() => setDodavanjeZa(null)}
        />
      )}

      {forma?.pv.vjezba && (
        <PlanVjezbaForma
          vjezba={forma.pv.vjezba}
          pocetno={forma.pv}
          kilaza={kilaze.get(forma.pv.vjezba_id) ?? null}
          onZatvori={() => setForma(null)}
          onSpremi={(p) => spremiVjezbu(forma.pv, p)}
          onUkloni={() => ukloniVjezbu(forma.pv)}
          onPomakni={{ gore: pomak(forma.dan, forma.pv, -1), dolje: pomak(forma.dan, forma.pv, 1) }}
        />
      )}
    </>
  );
}

function NazivPlanaForma({
  plan,
  onGotovo,
  onOdustani,
}: {
  plan: Plan;
  onGotovo: () => void;
  onOdustani: () => void;
}) {
  const [naziv, setNaziv] = useState(plan.naziv);
  const [opis, setOpis] = useState(plan.opis);
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);

  async function spremi(e: FormEvent) {
    e.preventDefault();
    if (!naziv.trim()) return setGreska("Upiši naziv programa.");
    setSalje(true);
    const { error } = await supabase()
      .from("planovi")
      .update({ naziv: naziv.trim().slice(0, 80), opis: opis.trim().slice(0, 1000) })
      .eq("id", plan.id);
    setSalje(false);
    if (error) return setGreska(prevediGresku(error.message));
    onGotovo();
  }

  return (
    <Kartica>
      <form onSubmit={spremi} className="flex flex-col gap-4">
        <Polje
          id="plan-naziv"
          oznaka="Naziv programa"
          placeholder="npr. Faza 1 – snaga"
          maxLength={80}
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
        />
        <label htmlFor="plan-opis" className="block">
          <span className="mb-2 block text-sm font-medium text-tekst-2">Opis za klijenta (neobavezno)</span>
          <textarea
            id="plan-opis"
            rows={3}
            maxLength={1000}
            value={opis}
            onChange={(e) => setOpis(e.target.value)}
            className="w-full rounded-2xl border border-rub bg-povrsina-2 px-4 py-3 text-base text-tekst outline-none focus:border-vatra focus:ring-2 focus:ring-vatra/30"
          />
        </label>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        <div className="grid grid-cols-2 gap-3">
          <Gumb type="button" varijanta="sporedni" onClick={onOdustani}>
            Odustani
          </Gumb>
          <Gumb type="submit" disabled={salje}>
            {salje ? "…" : "Spremi"}
          </Gumb>
        </div>
      </form>
    </Kartica>
  );
}
