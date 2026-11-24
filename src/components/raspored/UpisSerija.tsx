"use client";

import { useState, type ReactNode } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka } from "@/components/ui";
import { ZaglavljeSerija } from "@/components/trening/SerijeUnos";
import { opisKilaze } from "@/components/trening/useBazneIKilaze";
import { predlozakPonavljanja, rijecSerija, type TreningVjezba } from "@/lib/kalendar";
import { prevediGresku } from "@/lib/greske";
import { formatG, parsirajBroj } from "@/lib/makroi";
import { supabase } from "@/lib/supabase/client";
import { opisCilja, serijePlana, uSeriju, type Kilaza, type PodaciBazne, type Serija } from "@/lib/treninzi";

/** `kg` je tekst drugog polja: kilaža, a ako je vježba „riječ” – opterećenje riječju (npr. "žuta guma"). */
type Red = { redni: number; ponavljanja: string; kg: string; spremljeno: Serija | null };
/** cijela vježba: sekunde umjesto ponavljanja, riječ umjesto kilaže */
type Nacin = { sekunde: boolean; rijec: boolean };

const tekstOpterecenja = (s: Serija) => s.rijec ?? formatG(s.kg);
const istiNacin = (s: Serija, n: Nacin) => s.sekunde === n.sekunde && (s.rijec !== null) === n.rijec;

function pocetniNacin(tv: TreningVjezba, spremljene: Serija[]): Nacin {
  const s = [...spremljene].sort((a, b) => a.redni_broj - b.redni_broj)[0];
  if (s) return { sekunde: s.sekunde, rijec: s.rijec !== null };
  const p = serijePlana(tv)[0];
  return { sekunde: Boolean(p?.sekunde), rijec: Boolean(p?.rijec) };
}

function pocetniRedovi(tv: TreningVjezba, spremljene: Serija[], nacin: Nacin): Red[] {
  // plan svake serije (različita ponavljanja i kilaža po seriji, ili sve iste)
  const plan = serijePlana(tv);
  const broj = Math.max(plan.length, spremljene.reduce((m, s) => Math.max(m, s.redni_broj), 0));
  return Array.from({ length: broj }, (_, i) => {
    const s = spremljene.find((x) => x.redni_broj === i + 1) ?? null;
    const p = plan[Math.min(i, plan.length - 1)];
    const pon = predlozakPonavljanja(p.ponavljanja);
    const kg = nacin.rijec ? (p.rijec ?? "") : p.kg !== null && p.kg > 0 ? formatG(p.kg) : "";
    return { redni: i + 1, ponavljanja: s ? String(s.ponavljanja) : pon, kg: s ? tekstOpterecenja(s) : kg, spremljeno: s };
  });
}

const promijenjen = (r: Red, n: Nacin) =>
  !r.spremljeno ||
  r.ponavljanja !== String(r.spremljeno.ponavljanja) ||
  r.kg !== tekstOpterecenja(r.spremljeno) ||
  !istiNacin(r.spremljeno, n);

/** Trener na treningu upisuje koliko je klijent stvarno napravio (serija po serija). */
export function UpisSerija({
  klijentId,
  treningId,
  tv,
  spremljene,
  kilaza,
  polazno = null,
  stalnaNapomena = null,
  onPromjena,
  onZatvori,
}: {
  klijentId: string;
  treningId: string;
  tv: TreningVjezba;
  spremljene: Serija[];
  kilaza: Kilaza | null;
  /** polazna kilaža iz baznih vježbi (dok nema odrađenih serija) */
  polazno?: PodaciBazne | null;
  /** stalna napomena klijenta za ovu vježbu (npr. "sjedalo lvl3") */
  stalnaNapomena?: ReactNode;
  onPromjena: () => void;
  onZatvori: () => void;
}) {
  const [nacin, setNacin] = useState<Nacin>(() => pocetniNacin(tv, spremljene));
  const [redovi, setRedovi] = useState<Red[]>(() => pocetniRedovi(tv, spremljene, pocetniNacin(tv, spremljene)));
  const [radi, setRadi] = useState<number | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [zavrsena, setZavrsena] = useState(tv.zavrsena);
  const [oznacava, setOznacava] = useState(false);

  /** Klijent je odradio manje serija nego u planu: trener potvrđuje vježbu kao gotovu (plan ostaje zapisan). */
  async function oznaciGotovo(da: boolean) {
    setGreska(null);
    setOznacava(true);
    const { error } = await supabase().from("trening_vjezbe").update({ zavrsena: da }).eq("id", tv.id);
    setOznacava(false);
    if (error) return setGreska(prevediGresku(error.message));
    setZavrsena(da);
    onPromjena();
    if (da) onZatvori();
  }

  function promijeni(i: number, polje: "ponavljanja" | "kg", vrijednost: string) {
    setRedovi((rr) => rr.map((r, j) => (j === i ? { ...r, [polje]: vrijednost } : r)));
  }

  /** kg ⇄ riječ: kilaža i riječ se ne prepisuju jedna u drugu (vraća se ono što je spremljeno na taj način) */
  function prebaciRijec() {
    const novi = { ...nacin, rijec: !nacin.rijec };
    setNacin(novi);
    setRedovi((rr) =>
      rr.map((r) => ({ ...r, kg: r.spremljeno && (r.spremljeno.rijec !== null) === novi.rijec ? tekstOpterecenja(r.spremljeno) : "" })),
    );
  }

  async function spremi(i: number) {
    const r = redovi[i];
    setGreska(null);
    const ponavljanja = r.ponavljanja.trim() === "" ? null : Number(r.ponavljanja.trim());
    if (ponavljanja === null || !Number.isInteger(ponavljanja) || ponavljanja < 0 || ponavljanja > 1000) {
      return setGreska(`Serija ${r.redni}: upiši broj ${nacin.sekunde ? "sekundi" : "ponavljanja"}.`);
    }
    let kg = 0;
    let rijec: string | null = null;
    if (nacin.rijec) {
      rijec = r.kg.trim().slice(0, 40);
      if (!rijec) return setGreska(`Serija ${r.redni}: upiši opterećenje (npr. žuta guma).`);
    } else {
      const k = parsirajBroj(r.kg);
      if (k === null || k > 1000) return setGreska(`Serija ${r.redni}: kilaža nije ispravna.`);
      kg = k;
    }
    setRadi(i);
    const { data, error } = await supabase()
      .from("odradjene_serije")
      .upsert(
        {
          klijent_id: klijentId,
          trening_id: treningId,
          vjezba_id: tv.vjezba_id,
          plan_vjezba_id: null,
          redni_broj: r.redni,
          ponavljanja,
          kg,
          sekunde: nacin.sekunde,
          rijec,
        },
        { onConflict: "trening_id,plan_vjezba_id,vjezba_id,redni_broj" },
      )
      .select()
      .single();
    setRadi(null);
    if (error || !data) return setGreska(prevediGresku(error?.message));
    const s = uSeriju(data);
    setRedovi((rr) =>
      rr.map((x, j) => (j === i ? { ...x, ponavljanja: String(s.ponavljanja), kg: tekstOpterecenja(s), spremljeno: s } : x)),
    );
    onPromjena();
  }

  /** Ponovni dodir na zeleni ✓: serija više nije odrađena (brojevi ostaju upisani). */
  async function ponisti(i: number) {
    const s = redovi[i]?.spremljeno;
    if (!s) return;
    setGreska(null);
    setRadi(i);
    const { error } = await supabase().from("odradjene_serije").delete().eq("id", s.id);
    setRadi(null);
    if (error) return setGreska(prevediGresku(error.message));
    setRedovi((rr) => rr.map((x, j) => (j === i ? { ...x, spremljeno: null } : x)));
    onPromjena();
  }

  async function ukloniZadnju() {
    const i = redovi.length - 1;
    const r = redovi[i];
    if (!r || (redovi.length <= 1 && !r.spremljeno)) return;
    if (r.spremljeno) {
      setRadi(i);
      const { error } = await supabase().from("odradjene_serije").delete().eq("id", r.spremljeno.id);
      setRadi(null);
      if (error) return setGreska(prevediGresku(error.message));
      onPromjena();
    }
    // zadnji red ostaje (prazan za ponovni upis), ostali se uklanjaju
    setRedovi((rr) => (rr.length <= 1 ? rr.map((x) => ({ ...x, spremljeno: null })) : rr.slice(0, -1)));
  }

  function dodajSeriju() {
    setRedovi((rr) => {
      const z = rr[rr.length - 1];
      return [...rr, { redni: rr.length + 1, ponavljanja: z?.ponavljanja ?? "", kg: z?.kg ?? "", spremljeno: null }];
    });
  }

  const spremljenih = redovi.filter((r) => r.spremljeno).length;
  const polje =
    "h-14 w-full rounded-2xl border border-rub bg-povrsina-2 text-center text-xl font-semibold tabular-nums text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30";

  return (
    <Ploca naslov={tv.vjezba?.naziv ?? "Vježba"} onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-povrsina-2 px-4 py-3">
          <p className="text-sm text-tekst-2">Plan</p>
          <p className="text-xl font-bold tabular-nums">{opisCilja(tv)}</p>
          {tv.napomena && <p className="mt-1 text-sm text-amber-200">{tv.napomena}</p>}
          <p className="mt-2 text-sm text-tekst-2">{opisKilaze(kilaza, polazno)}</p>
        </div>
        {stalnaNapomena}

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold">Odrađeno</span>
            <span className="text-sm text-tekst-2 tabular-nums">
              {spremljenih}/{redovi.length} serija
            </span>
          </div>
          <ZaglavljeSerija
            sekunde={nacin.sekunde}
            rijec={nacin.rijec}
            onSekunde={() => setNacin((n) => ({ ...n, sekunde: !n.sekunde }))}
            onRijec={prebaciRijec}
            kolone="grid-cols-[1.75rem_1fr_auto_1fr_3rem]"
            saKvacicom
          />
          {redovi.map((r, i) => {
            const p = promijenjen(r, nacin);
            return (
              <div key={r.redni} className="grid grid-cols-[1.75rem_1fr_auto_1fr_3rem] items-center gap-x-2">
                <span className="text-center font-semibold text-tekst-2">{r.redni}</span>
                <input
                  aria-label={`Serija ${r.redni} – ${nacin.sekunde ? "sekunde" : "ponavljanja"}`}
                  inputMode="numeric"
                  value={r.ponavljanja}
                  placeholder={tv.ponavljanja}
                  onChange={(e) => promijeni(i, "ponavljanja", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className={polje}
                />
                <span className="text-tekst-2">×</span>
                {nacin.rijec ? (
                  <input
                    aria-label={`Serija ${r.redni} – opterećenje`}
                    maxLength={40}
                    value={r.kg}
                    placeholder="npr. žuta guma"
                    onChange={(e) => promijeni(i, "kg", e.target.value)}
                    className={`${polje} px-2 text-base font-medium`}
                  />
                ) : (
                  <input
                    aria-label={`Serija ${r.redni} – kilogrami`}
                    inputMode="decimal"
                    value={r.kg}
                    placeholder="0"
                    onChange={(e) => promijeni(i, "kg", e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className={polje}
                  />
                )}
                <button
                  type="button"
                  aria-label={p ? `Spremi seriju ${r.redni}` : `Poništi seriju ${r.redni}`}
                  disabled={radi !== null}
                  onClick={() => (p ? spremi(i) : ponisti(i))}
                  className={`flex h-14 w-12 items-center justify-center rounded-2xl text-xl font-bold transition active:scale-95 ${
                    !p ? "bg-emerald-500/20 text-emerald-300" : "bg-linear-to-r from-vatra to-vatra-2 text-white disabled:opacity-50"
                  }`}
                >
                  {radi === i ? "…" : "✓"}
                </button>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Gumb type="button" varijanta="sporedni" malen onClick={dodajSeriju} disabled={radi !== null}>
              + Serija
            </Gumb>
            <Gumb type="button" varijanta="sporedni" malen onClick={ukloniZadnju} disabled={radi !== null || (redovi.length <= 1 && !redovi[0]?.spremljeno)}>
              − Zadnja serija
            </Gumb>
          </div>
          <p className="text-center text-xs text-tekst-2">Slučajno potvrđeno? Dodirni zeleni ✓ i serija se poništi.</p>
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {spremljenih > 0 && spremljenih < tv.serije && !zavrsena && (
          <Gumb type="button" onClick={() => oznaciGotovo(true)} disabled={oznacava || radi !== null}>
            {oznacava ? "Spremam…" : `✓ Gotovo – ${spremljenih} od ${tv.serije} ${rijecSerija(tv.serije)}`}
          </Gumb>
        )}
        {spremljenih > 0 && spremljenih < tv.serije && zavrsena && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200">
            <span>
              ✓ Vježba je gotova – {spremljenih} od {tv.serije} {rijecSerija(tv.serije)}
            </span>
            <button
              type="button"
              disabled={oznacava}
              onClick={() => oznaciGotovo(false)}
              className="shrink-0 font-semibold text-tekst-2 underline underline-offset-2 disabled:opacity-50"
            >
              {oznacava ? "…" : "Poništi"}
            </button>
          </div>
        )}
        <Gumb type="button" varijanta="sporedni" onClick={onZatvori}>
          Zatvori
        </Gumb>
      </div>
    </Ploca>
  );
}
