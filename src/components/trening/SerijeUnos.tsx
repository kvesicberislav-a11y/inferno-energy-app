"use client";

import { Gumb } from "@/components/ui";
import { formatG, parsirajBroj } from "@/lib/makroi";
import { KORAK_KG, type SerijaPlana } from "@/lib/treninzi";

/**
 * Jedan red unosa (kao tekst dok se upisuje): ponavljanja × kg.
 * `sekunde`: prvi broj su sekunde (npr. plank 60 s). `rijec`: u `kg` je riječ umjesto kilaže (npr. "žuta guma").
 */
export type RedSerije = { ponavljanja: string; kg: string; sekunde?: boolean; rijec?: boolean };

/** Redovi za unos iz spremljenih serija (ili `prazno` praznih redova ako ih nema). */
export function redoviIzPlana(plan: SerijaPlana[] | null | undefined, prazno: number): RedSerije[] {
  if (plan?.length) {
    // sekunde / riječ vrijede za cijelu vježbu (kao u prvoj seriji)
    const sekunde = Boolean(plan[0].sekunde);
    const rijec = Boolean(plan[0].rijec);
    return plan.map((s) => ({
      ponavljanja: s.ponavljanja,
      kg: rijec ? (s.rijec ?? "") : s.kg !== null ? formatG(s.kg) : "",
      sekunde,
      rijec,
    }));
  }
  return Array.from({ length: prazno }, () => ({ ponavljanja: "", kg: "" }));
}

/** Upisani redovi → serije. Potpuno prazni redovi se preskaču. */
export function planIzRedova(redovi: RedSerije[]): { plan: SerijaPlana[] } | { greska: string } {
  const plan: SerijaPlana[] = [];
  for (const [i, r] of redovi.entries()) {
    const pon = r.ponavljanja.trim().slice(0, 20);
    const kgTekst = r.kg.trim();
    if (!pon && !kgTekst) continue;
    if (!pon) return { greska: `Serija ${i + 1}: upiši ${r.sekunde ? "broj sekundi" : "broj ponavljanja"}.` };
    const serija: SerijaPlana = { ponavljanja: pon, kg: null };
    if (r.rijec) {
      if (kgTekst) serija.rijec = kgTekst.slice(0, 40);
    } else {
      const kg = kgTekst ? parsirajBroj(kgTekst) : null;
      if (kgTekst && (kg === null || kg > 1000)) return { greska: `Serija ${i + 1}: kilaža nije ispravna.` };
      serija.kg = kg !== null && kg > 0 ? kg : null;
    }
    if (r.sekunde) serija.sekunde = true;
    plan.push(serija);
  }
  return { plan };
}

function pomaknut(kg: string, smjer: -1 | 1) {
  const sada = kg.trim() ? (parsirajBroj(kg) ?? 0) : 0;
  const nova = Math.round((sada + smjer * KORAK_KG) * 10) / 10;
  return nova > 0 ? formatG(Math.min(1000, nova)) : "";
}

/**
 * Naslovi stupaca koji se mogu dodirnuti: „ponavljanja” ⇄ „sekunde” i „kg” ⇄ „riječ”.
 * `kolone` = ista mreža kao redovi ispod; `saKvacicom` = redovi imaju i gumb ✓ na kraju.
 */
export function ZaglavljeSerija({
  sekunde,
  rijec,
  onSekunde,
  onRijec,
  kolone,
  saKvacicom = false,
}: {
  sekunde: boolean;
  rijec: boolean;
  onSekunde: () => void;
  onRijec: () => void;
  kolone: string;
  saKvacicom?: boolean;
}) {
  const tipka =
    "mx-auto flex h-8 items-center gap-1 rounded-lg border border-rub bg-povrsina px-2.5 text-xs font-semibold text-tekst active:scale-95";
  return (
    <div className={`grid ${kolone} items-center gap-x-2 text-xs text-tekst-2`}>
      <span />
      <button
        type="button"
        onClick={onSekunde}
        aria-label={sekunde ? "Mjeri u ponavljanjima" : "Mjeri u sekundama"}
        className={tipka}
      >
        {sekunde ? "sekunde" : "ponavljanja"} <span className="text-tekst-2">⇄</span>
      </button>
      <span />
      <button
        type="button"
        onClick={onRijec}
        aria-label={rijec ? "Opterećenje u kilogramima" : "Opterećenje riječju (npr. žuta guma)"}
        className={tipka}
      >
        {rijec ? "riječ" : "kg"} <span className="text-tekst-2">⇄</span>
      </button>
      {saKvacicom && <span />}
    </div>
  );
}

/**
 * Unos serija jednu po jednu: za svaku seriju ponavljanja × kg,
 * + Serija / − Zadnja serija i brza promjena kilaže svim serijama.
 * Dodir na naslov stupca: ponavljanja ⇄ sekunde, kg ⇄ riječ (za cijelu vježbu).
 */
export function SerijeUnos({
  redovi,
  onPromjena,
  maxKg = null,
}: {
  redovi: RedSerije[];
  onPromjena: (redovi: RedSerije[]) => void;
  /** najveća kilaža klijenta na ovoj vježbi (za gumb „= max”) */
  maxKg?: number | null;
}) {
  const sekunde = Boolean(redovi[0]?.sekunde);
  const rijec = Boolean(redovi[0]?.rijec);
  const imaKg = !rijec && redovi.some((r) => (parsirajBroj(r.kg) ?? 0) > 0);

  function promijeni(i: number, polje: "ponavljanja" | "kg", vrijednost: string) {
    onPromjena(redovi.map((r, j) => (j === i ? { ...r, [polje]: vrijednost } : r)));
  }
  function dodaj() {
    if (redovi.length >= 20) return;
    onPromjena([...redovi, { ...(redovi[redovi.length - 1] ?? { ponavljanja: "", kg: "" }) }]);
  }
  function ukloni() {
    if (redovi.length > 1) onPromjena(redovi.slice(0, -1));
  }
  function pomakni(smjer: -1 | 1) {
    onPromjena(redovi.map((r) => ({ ...r, kg: smjer < 0 && !r.kg.trim() ? "" : pomaknut(r.kg, smjer) })));
  }
  // kilaža i riječ se ne prepisuju jedna u drugu (stupac se isprazni)
  const prebaciSekunde = () => onPromjena(redovi.map((r) => ({ ...r, sekunde: !sekunde })));
  const prebaciRijec = () => onPromjena(redovi.map((r) => ({ ...r, rijec: !rijec, kg: "" })));

  const polje =
    "h-12 w-full rounded-2xl border border-rub bg-povrsina-2 text-center text-lg font-semibold tabular-nums text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30";
  const malaTipka =
    "h-11 rounded-xl border border-rub bg-povrsina-2 px-2 text-sm font-semibold text-tekst active:scale-95 disabled:opacity-40";
  const kolone = "grid-cols-[1.75rem_1fr_auto_1fr]";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-tekst-2">Serije</span>
        <span className="text-sm text-tekst-2 tabular-nums">{redovi.length}</span>
      </div>
      <ZaglavljeSerija sekunde={sekunde} rijec={rijec} onSekunde={prebaciSekunde} onRijec={prebaciRijec} kolone={kolone} />
      {redovi.map((r, i) => (
        <div key={i} className={`grid ${kolone} items-center gap-x-2`}>
          <span className="text-center font-semibold text-tekst-2">{i + 1}</span>
          <input
            aria-label={`Serija ${i + 1} – ${sekunde ? "sekunde" : "ponavljanja"}`}
            inputMode="numeric"
            maxLength={20}
            placeholder={sekunde ? "60" : "10"}
            value={r.ponavljanja}
            onChange={(e) => promijeni(i, "ponavljanja", e.target.value)}
            onFocus={(e) => e.target.select()}
            className={polje}
          />
          <span className="text-tekst-2">×</span>
          {rijec ? (
            <input
              aria-label={`Serija ${i + 1} – opterećenje`}
              maxLength={40}
              placeholder="npr. žuta guma"
              value={r.kg}
              onChange={(e) => promijeni(i, "kg", e.target.value)}
              className={`${polje} px-2 text-base font-medium`}
            />
          ) : (
            <input
              aria-label={`Serija ${i + 1} – kilogrami`}
              inputMode="decimal"
              placeholder="—"
              value={r.kg}
              onChange={(e) => promijeni(i, "kg", e.target.value)}
              onFocus={(e) => e.target.select()}
              className={polje}
            />
          )}
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Gumb type="button" varijanta="sporedni" malen onClick={dodaj} disabled={redovi.length >= 20}>
          + Serija
        </Gumb>
        <Gumb type="button" varijanta="sporedni" malen onClick={ukloni} disabled={redovi.length <= 1}>
          − Zadnja serija
        </Gumb>
      </div>
      {!rijec && (
        <>
          <span className="pt-1 text-xs text-tekst-2">Kilaža svim serijama:</span>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" className={malaTipka} onClick={() => pomakni(-1)} disabled={!imaKg}>
              − {formatG(KORAK_KG)} kg
            </button>
            <button
              type="button"
              className={malaTipka}
              onClick={() => maxKg != null && onPromjena(redovi.map((r) => ({ ...r, kg: formatG(maxKg) })))}
              disabled={maxKg == null}
            >
              = max{maxKg != null ? ` ${formatG(maxKg)}` : ""}
            </button>
            <button type="button" className={malaTipka} onClick={() => pomakni(1)}>
              + {formatG(KORAK_KG)} kg
            </button>
          </div>
        </>
      )}
    </div>
  );
}
