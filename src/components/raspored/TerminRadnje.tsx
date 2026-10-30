"use client";

import { useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka } from "@/components/ui";
import { danMjesec, danasZagreb, dodajDane } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { opisPravila, opisTermina, type Termin } from "@/lib/raspored";
import { supabase } from "@/lib/supabase/client";
import { obavijestiKlijenta, ocistiPlanoveBezTermina } from "./useRaspored";

const POLJE =
  "h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none focus:border-vatra";

/** Trener: otkaži, pomakni ili vrati jedan termin. */
export function TerminRadnje({
  termin,
  ime,
  onGotovo,
  onZatvori,
}: {
  termin: Termin;
  ime: string;
  onGotovo: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const [pomicanje, setPomicanje] = useState(false);
  const [noviDatum, setNoviDatum] = useState(termin.datum);
  const [novoVrijeme, setNovoVrijeme] = useState(termin.vrijeme);
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);
  const sb = supabase();
  const izvorni = { datum: termin.izvorniDatum ?? termin.datum, vrijeme: termin.pravilo?.vrijeme ?? termin.vrijeme };

  async function izvrsi(
    akcija: () => PromiseLike<{ error: { message: string } | null }>,
    promjena: string,
    /** nakon uspjeha: plan treninga prati termin (pomak / brisanje); može vratiti upozorenje */
    nakon?: () => Promise<string | void>,
  ) {
    setGreska(null);
    setRadi(true);
    const { error } = await akcija();
    if (error) {
      setRadi(false);
      return setGreska(prevediGresku(error.message));
    }
    const upozorenje = nakon ? await nakon().catch(() => undefined) : undefined;
    const poruka = await obavijestiKlijenta(termin.klijentId, promjena);
    setRadi(false);
    onGotovo(upozorenje ? `${poruka} ${upozorenje}` : poruka);
  }

  /** Plan treninga ide s terminom na drugi dan (ako taj dan već nema svoj plan). */
  async function premjestiPlan(iz: string, u: string): Promise<string | void> {
    const { data, error } = await sb.rpc("premjesti_trening", { p_klijent: termin.klijentId, p_iz: iz, p_u: u });
    if (error || data === false) {
      return `Pažnja: plan treninga ostao je na ${danMjesec(iz)}, jer ${danMjesec(u)} već ima svoj plan.`;
    }
  }

  function otkazi() {
    if (!window.confirm(`Otkazati termin ${opisTermina(termin)}?`)) return;
    if (termin.pravilo) {
      return izvrsi(
        () =>
          sb
            .from("termini_iznimke")
            .upsert(
              { pravilo_id: termin.pravilo!.id, datum: izvorni.datum, otkazan: true, novi_datum: null, novo_vrijeme: null },
              { onConflict: "pravilo_id,datum" },
            ),
        `Otkazan je termin: ${opisTermina(termin)}.`,
        termin.datum !== izvorni.datum ? () => premjestiPlan(termin.datum, izvorni.datum) : undefined,
      );
    }
    return izvrsi(
      () => sb.from("termini_dodatni").delete().eq("id", termin.dodatni!.id),
      `Otkazan je termin: ${opisTermina(termin)}.`,
    );
  }

  // plan treninga ide s terminom na novi dan
  const premjestiTrening = () => premjestiPlan(termin.datum, noviDatum);

  function pomakni() {
    if (!noviDatum || !novoVrijeme) return setGreska("Odaberi datum i vrijeme.");
    const novo = { datum: noviDatum, vrijeme: novoVrijeme };
    if (termin.pravilo) {
      if (noviDatum > dodajDane(izvorni.datum, 28)) {
        return setGreska("Stalni termin možeš pomaknuti najviše 4 tjedna. Za kasniji datum dodaj dodatni termin.");
      }
      return izvrsi(
        () =>
          sb
            .from("termini_iznimke")
            .upsert(
              {
                pravilo_id: termin.pravilo!.id,
                datum: izvorni.datum,
                otkazan: false,
                novi_datum: noviDatum,
                novo_vrijeme: novoVrijeme,
              },
              { onConflict: "pravilo_id,datum" },
            ),
        `Termin ${opisTermina(izvorni)} pomaknut je na ${opisTermina(novo)}.`,
        premjestiTrening,
      );
    }
    return izvrsi(
      () => sb.from("termini_dodatni").update({ datum: noviDatum, vrijeme: novoVrijeme }).eq("id", termin.dodatni!.id),
      `Termin ${opisTermina(termin)} pomaknut je na ${opisTermina(novo)}.`,
      premjestiTrening,
    );
  }

  /** Obriši samo ovaj termin – nestaje iz kalendara (i kod klijenta), mjesto je slobodno. */
  function obrisiOvaj() {
    if (!window.confirm(`Obrisati termin ${opisTermina(termin)}? Nestat će iz kalendara.`)) return;
    if (termin.pravilo) {
      return izvrsi(
        () =>
          sb.from("termini_iznimke").upsert(
            {
              pravilo_id: termin.pravilo!.id,
              datum: izvorni.datum,
              otkazan: true,
              obrisan: true,
              novi_datum: null,
              novo_vrijeme: null,
            },
            { onConflict: "pravilo_id,datum" },
          ),
        `Otkazan je termin: ${opisTermina(termin)}.`,
        ukloniPlan,
      );
    }
    return izvrsi(
      () => sb.from("termini_dodatni").delete().eq("id", termin.dodatni!.id),
      `Otkazan je termin: ${opisTermina(termin)}.`,
      ukloniPlan,
    );
  }

  // prazan plan treninga bez termina se briše (upisane serije ostaju zauvijek)
  const ukloniPlan = () => ocistiPlanoveBezTermina(termin.klijentId, termin.datum);

  /** Obriši ovaj i sve sljedeće termine stalnog termina (raniji ostaju). Ako je ovo prvi, briše se cijeli. */
  function obrisiOdOvog() {
    const p = termin.pravilo;
    if (!p) return;
    if (
      !window.confirm(
        `Obrisati stalni termin (${opisPravila(p)}) od ${opisTermina(izvorni)} nadalje? Svi ti termini nestaju iz kalendara.`,
      )
    ) {
      return;
    }
    const prvi = dodajDane(izvorni.datum, -7) < p.od_datuma;
    return izvrsi(
      () =>
        prvi
          ? sb.from("termini_pravila").delete().eq("id", p.id)
          : sb.from("termini_pravila").update({ do_datuma: dodajDane(izvorni.datum, -1) }).eq("id", p.id),
      `Ukinut je stalni termin (${opisPravila(p)}) od ${opisTermina(izvorni)}.`,
      () => ocistiPlanoveBezTermina(termin.klijentId, [izvorni.datum, termin.datum].sort()[0]),
    );
  }

  function vrati() {
    if (!termin.iznimka) return;
    const bioPomaknut = !termin.iznimka.otkazan;
    return izvrsi(
      () => sb.from("termini_iznimke").delete().eq("id", termin.iznimka!.id),
      `Termin ${opisTermina(izvorni)} ipak ostaje u uobičajeno vrijeme.`,
      bioPomaknut ? () => premjestiPlan(termin.datum, izvorni.datum) : undefined,
    );
  }

  return (
    <Ploca naslov={ime} onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-povrsina-2 px-4 py-3">
          <p className={`text-lg font-semibold ${termin.otkazan ? "text-tekst-2 line-through" : ""}`}>
            {opisTermina(termin)}
          </p>
          <p className="text-sm text-tekst-2">
            {termin.trajanje} min · {termin.pravilo ? "stalni termin" : "dodatni termin"}
            {termin.otkazan ? " · otkazan" : termin.iznimka ? ` · pomaknut (bio ${opisTermina(izvorni)})` : ""}
          </p>
          {termin.napomena && <p className="mt-1 text-sm text-amber-200">{termin.napomena}</p>}
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}

        {pomicanje ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-tekst-2">Novi datum</span>
                <input
                  type="date"
                  min={danasZagreb()}
                  // stalni termin se može pomaknuti najviše 4 tjedna (dalje bi nestao iz rasporeda)
                  max={termin.pravilo ? dodajDane(izvorni.datum, 28) : undefined}
                  value={noviDatum}
                  onChange={(e) => setNoviDatum(e.target.value)}
                  className={POLJE}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-tekst-2">Novo vrijeme</span>
                <input type="time" value={novoVrijeme} onChange={(e) => setNovoVrijeme(e.target.value)} className={POLJE} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Gumb varijanta="sporedni" onClick={() => setPomicanje(false)} disabled={radi}>
                Odustani
              </Gumb>
              <Gumb onClick={pomakni} disabled={radi}>
                {radi ? "…" : "Pomakni"}
              </Gumb>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {!termin.otkazan && (
              <Gumb varijanta="sporedni" onClick={() => setPomicanje(true)} disabled={radi}>
                Pomakni termin
              </Gumb>
            )}
            {termin.iznimka && (
              <Gumb varijanta="sporedni" onClick={vrati} disabled={radi}>
                {termin.otkazan ? "Vrati termin (ipak se održava)" : "Vrati na uobičajeno vrijeme"}
              </Gumb>
            )}
            {termin.pravilo && !termin.otkazan && (
              <Gumb varijanta="sporedni" onClick={otkazi} disabled={radi}>
                Otkaži samo ovaj (ostaje precrtan)
              </Gumb>
            )}
            <Gumb varijanta="opasni" onClick={obrisiOvaj} disabled={radi}>
              {termin.pravilo ? "Obriši samo ovaj termin" : "Obriši termin"}
            </Gumb>
            {termin.pravilo && (
              <Gumb varijanta="opasni" onClick={obrisiOdOvog} disabled={radi}>
                Obriši ovaj i sve sljedeće
              </Gumb>
            )}
            <p className="text-center text-xs text-tekst-2">Obrisani termin nestaje iz kalendara i mjesto je slobodno.</p>
          </div>
        )}
      </div>
    </Ploca>
  );
}
