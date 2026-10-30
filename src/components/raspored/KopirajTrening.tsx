"use client";

import { useEffect, useState } from "react";
import { Ploca } from "@/components/Ploca";
import { Poruka, Ucitavanje } from "@/components/ui";
import { opisDana } from "@/lib/datum";
import { prevediGresku } from "@/lib/greske";
import { nazivTreninga } from "@/lib/kalendar";
import { supabase } from "@/lib/supabase/client";

type Izvor = { datum: string; naziv: string; vjezbi: number; zavrsen: boolean };

/** Kopiraj plan u ovaj termin s jednog od klijentovih drugih treninga (bilo kojeg tjedna). */
export function KopirajTrening({
  klijentId,
  datum,
  zamijeni,
  onKopirano,
  onZatvori,
}: {
  klijentId: string;
  datum: string;
  /** ovaj termin već ima vježbe – kopija ih zamjenjuje */
  zamijeni: boolean;
  onKopirano: (poruka: string) => void;
  onZatvori: () => void;
}) {
  const [izvori, setIzvori] = useState<Izvor[] | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("treninzi")
      .select("datum, naziv, skupine, zavrsen, trening_vjezbe(count)")
      .eq("klijent_id", klijentId)
      .eq("iz_kalendara", true)
      .neq("datum", datum)
      .order("datum", { ascending: false })
      .limit(40)
      .then(({ data, error }) => {
        if (!aktivno) return;
        if (error) setGreska(prevediGresku(error.message));
        setIzvori(
          (data ?? [])
            .map((r) => ({
              datum: String(r.datum),
              naziv: nazivTreninga({
                skupine: Array.isArray(r.skupine) ? r.skupine.map(String) : [],
                naziv: String(r.naziv ?? ""),
              }),
              vjezbi: Number((r.trening_vjezbe as { count: number }[] | null)?.[0]?.count ?? 0),
              zavrsen: Boolean(r.zavrsen),
            }))
            .filter((x) => x.vjezbi > 0),
        );
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId, datum]);

  async function kopiraj(iz: Izvor) {
    if (zamijeni && !window.confirm(`Zamijeniti sadašnji plan treningom od ${opisDana(iz.datum)}?`)) return;
    setGreska(null);
    setRadi(true);
    const { data, error } = await supabase().rpc("kopiraj_trening", {
      p_klijent: klijentId,
      p_iz: iz.datum,
      p_u: datum,
      p_zamijeni: zamijeni,
    });
    setRadi(false);
    if (error) return setGreska(prevediGresku(error.message));
    if (!Number(data)) return setGreska("Taj trening nema vježbi za kopiranje.");
    onKopirano(`Kopirano s ${opisDana(iz.datum)}. Promijeni što treba.`);
  }

  return (
    <Ploca naslov="Kopiraj plan" onZatvori={onZatvori}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-tekst-2">Odaberi trening ove osobe s kojeg kopiraš plan (skupine, vježbe, serije i kilažu).</p>
        {greska && <Poruka tip="greska">{greska}</Poruka>}
        {izvori === null ? (
          <Ucitavanje />
        ) : izvori.length === 0 ? (
          <Poruka>Ova osoba još nema drugih treninga s planom.</Poruka>
        ) : (
          izvori.map((x) => (
            <button
              key={x.datum}
              type="button"
              disabled={radi}
              onClick={() => kopiraj(x)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-rub bg-povrsina-2 p-3 text-left active:scale-[0.99] disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block text-sm text-tekst-2">{opisDana(x.datum)}</span>
                <span className="block truncate font-semibold">{x.naziv}</span>
              </span>
              <span className="shrink-0 text-sm text-tekst-2">
                {x.vjezbi} {x.vjezbi === 1 ? "vježba" : x.vjezbi < 5 ? "vježbe" : "vježbi"}
                {x.zavrsen ? " · ✓" : ""}
              </span>
            </button>
          ))
        )}
      </div>
    </Ploca>
  );
}
