"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ploca } from "@/components/Ploca";
import { Razgovor } from "@/components/poruke/Razgovor";
import { UkljuciObavijesti } from "@/components/poruke/UkljuciObavijesti";
import { Zaglavlje } from "@/components/Zaglavlje";
import { Cip, Gumb, Poruka, Ucitavanje } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { kratkoVrijeme, posaljiPoruku, type Skupina } from "@/lib/poruke";
import { supabase } from "@/lib/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RedRazgovora = {
  id: string;
  ime: string;
  nacin: "uzivo" | "online";
  zadnja: string | null;
  zadnjaOdTrenera: boolean;
  vrijeme: string | null;
  neprocitano: number;
};

/** /trener/poruke – popis razgovora; /trener/poruke?id=… – razgovor s jednim klijentom. */
export function TrenerPoruke() {
  const id = useSearchParams().get("id") ?? "";
  return UUID.test(id) ? <RazgovorSKlijentom klijentId={id} /> : <PopisRazgovora />;
}

function RazgovorSKlijentom({ klijentId }: { klijentId: string }) {
  const [klijent, setKlijent] = useState<{ id: string; ime: string } | null | undefined>(undefined);

  useEffect(() => {
    let aktivno = true;
    supabase()
      .from("profili")
      .select("id, ime, email")
      .eq("id", klijentId)
      .eq("uloga", "klijent")
      .maybeSingle()
      .then(({ data }) => {
        if (aktivno) setKlijent(data ? { id: String(data.id), ime: String(data.ime || data.email) } : null);
      });
    return () => {
      aktivno = false;
    };
  }, [klijentId]);

  const natrag = (
    <Link href="/trener/poruke" className="self-start py-2 text-base font-medium text-vatra">
      ‹ Poruke
    </Link>
  );

  if (klijent === undefined || (klijent && klijent.id !== klijentId)) return <Ucitavanje />;
  if (!klijent) {
    return (
      <>
        {natrag}
        <Poruka tip="greska">Klijent nije pronađen.</Poruka>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        {natrag}
        <Link href={`/trener/klijent?id=${klijent.id}`} className="py-2 text-sm font-medium text-tekst-2">
          Profil klijenta ›
        </Link>
      </div>
      <h1 className="-mt-2 text-2xl font-bold">{klijent.ime}</h1>
      <Razgovor klijentId={klijent.id} jaSamTrener />
    </>
  );
}

function PopisRazgovora() {
  const [redovi, setRedovi] = useState<RedRazgovora[] | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [trazi, setTrazi] = useState("");
  const [grupna, setGrupna] = useState(false);
  const [verzija, setVerzija] = useState(0);

  useEffect(() => {
    let aktivno = true;
    let odgoda: ReturnType<typeof setTimeout> | undefined;
    const ucitaj = () =>
      supabase()
        .rpc("razgovori")
        .then(({ data, error }) => {
          if (!aktivno) return;
          setGreska(error ? prevediGresku(error.message) : null);
          setRedovi(
            ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
              id: String(r.klijent_id),
              ime: String(r.ime || r.email || ""),
              nacin: r.nacin === "online" ? "online" : "uzivo",
              zadnja: r.zadnja_poruka ? String(r.zadnja_poruka) : null,
              zadnjaOdTrenera: Boolean(r.zadnja_od_trenera),
              vrijeme: r.zadnje_vrijeme ? String(r.zadnje_vrijeme) : null,
              neprocitano: Number(r.neprocitano ?? 0),
            })),
          );
        });
    void ucitaj();

    // Nova poruka bilo kojeg klijenta → osvježi popis
    const sb = supabase();
    const kanal = sb
      .channel(`razgovori-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poruke" }, () => {
        clearTimeout(odgoda);
        odgoda = setTimeout(() => void ucitaj(), 400);
      })
      .subscribe();
    const naVidljivost = () => {
      if (document.visibilityState === "visible") void ucitaj();
    };
    document.addEventListener("visibilitychange", naVidljivost);
    return () => {
      aktivno = false;
      clearTimeout(odgoda);
      void sb.removeChannel(kanal);
      document.removeEventListener("visibilitychange", naVidljivost);
    };
  }, [verzija]);

  const filtar = trazi.trim().toLowerCase();
  const prikaz = (redovi ?? []).filter((r) => !filtar || r.ime.toLowerCase().includes(filtar));

  return (
    <>
      <Zaglavlje />
      <h1 className="pt-1 text-2xl font-bold">Poruke</h1>
      <UkljuciObavijesti uloga="trener" mjesto="poruke" />
      <Gumb varijanta="sporedni" onClick={() => setGrupna(true)} disabled={!redovi?.length}>
        📣 Poruka za više klijenata
      </Gumb>

      {greska && <Poruka tip="greska">{greska}</Poruka>}

      {redovi === null ? (
        <Ucitavanje />
      ) : redovi.length === 0 ? (
        <Poruka>Još nemaš klijenata. Kad se registriraju, ovdje ćeš im moći pisati.</Poruka>
      ) : (
        <div className="flex flex-col gap-2">
          {redovi.length > 6 && (
            <input
              type="search"
              aria-label="Traži klijenta"
              placeholder="Traži klijenta…"
              value={trazi}
              onChange={(e) => setTrazi(e.target.value)}
              className="h-12 w-full rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
            />
          )}
          {prikaz.map((r) => (
            <Link
              key={r.id}
              href={`/trener/poruke?id=${r.id}`}
              className={`flex items-center gap-3 rounded-2xl border bg-povrsina p-3 transition active:scale-[0.99] ${
                r.neprocitano ? "border-vatra/50" : "border-rub"
              }`}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-povrsina-2 font-bold text-tekst-2"
                aria-hidden="true"
              >
                {r.ime
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((d) => d[0]?.toUpperCase())
                  .join("") || "?"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold">{r.ime}</span>
                    {r.nacin === "online" && (
                      <span className="shrink-0 rounded-md bg-sky-500/20 px-1.5 text-[11px] font-semibold text-sky-200">
                        Online
                      </span>
                    )}
                  </span>
                  {r.vrijeme && <span className="shrink-0 text-xs text-tekst-2">{kratkoVrijeme(r.vrijeme)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${r.neprocitano ? "font-medium text-tekst" : "text-tekst-2"}`}>
                    {r.zadnja ? `${r.zadnjaOdTrenera ? "Ti: " : ""}${r.zadnja}` : "Još nema poruka"}
                  </span>
                  {r.neprocitano > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-vatra-2 px-1.5 text-[11px] font-bold text-white">
                      {r.neprocitano}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          ))}
          {prikaz.length === 0 && <p className="text-sm text-tekst-2">Nema klijenta s tim imenom.</p>}
        </div>
      )}

      {grupna && redovi && (
        <GrupnaPoruka
          redovi={redovi}
          onZatvori={() => setGrupna(false)}
          onPoslano={() => setVerzija((v) => v + 1)}
        />
      )}
    </>
  );
}

function GrupnaPoruka({
  redovi,
  onZatvori,
  onPoslano,
}: {
  redovi: RedRazgovora[];
  onZatvori: () => void;
  onPoslano: () => void;
}) {
  const [skupina, setSkupina] = useState<Skupina>("svi");
  const [tekst, setTekst] = useState("");
  const [salje, setSalje] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [poslano, setPoslano] = useState<number | null>(null);

  const brojevi: Record<Skupina, number> = {
    svi: redovi.length,
    uzivo: redovi.filter((r) => r.nacin === "uzivo").length,
    online: redovi.filter((r) => r.nacin === "online").length,
  };

  async function posalji(e: FormEvent) {
    e.preventDefault();
    if (!tekst.trim() || salje) return;
    setSalje(true);
    setGreska(null);
    const r = await posaljiPoruku(tekst.trim(), skupina);
    setSalje(false);
    if ("greska" in r) return setGreska(r.greska);
    setPoslano(r.broj);
    onPoslano();
  }

  return (
    <Ploca naslov="Poruka za više klijenata" onZatvori={onZatvori}>
      {poslano !== null ? (
        <div className="flex flex-col gap-3">
          <Poruka tip="uspjeh">
            ✓ Poslano {poslano} {poslano === 1 ? "klijentu" : "klijenata"}. Svaki je dobio poruku u svoj razgovor i
            obavijest na mobitel.
          </Poruka>
          <Gumb onClick={onZatvori}>Gotovo</Gumb>
        </div>
      ) : (
        <form onSubmit={posalji} className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-tekst-2">Kome šalješ?</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["svi", "Svima"],
                  ["uzivo", "Uživo"],
                  ["online", "Online"],
                ] as const
              ).map(([k, o]) => (
                <Cip
                  key={k}
                  aktivan={skupina === k}
                  className="h-12 px-0 text-base"
                  onClick={() => setSkupina(k)}
                  disabled={brojevi[k] === 0}
                >
                  {o} ({brojevi[k]})
                </Cip>
              ))}
            </div>
          </div>
          <label htmlFor="grupna-poruka" className="block">
            <span className="mb-2 block text-sm font-medium text-tekst-2">Poruka</span>
            <textarea
              id="grupna-poruka"
              rows={5}
              maxLength={2000}
              placeholder="npr. Sutra (petak) ne radim – treninzi se pomiču na subotu."
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              className="w-full rounded-2xl border border-rub bg-povrsina-2 px-4 py-3 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra focus:ring-2 focus:ring-vatra/30"
            />
          </label>
          <p className="-mt-2 text-xs text-tekst-2">
            Svaki klijent poruku dobiva u svoj razgovor s tobom, pa ti može odgovoriti samo on.
          </p>
          {greska && <Poruka tip="greska">{greska}</Poruka>}
          <Gumb type="submit" disabled={salje || !tekst.trim() || brojevi[skupina] === 0}>
            {salje ? "Šaljem…" : `Pošalji (${brojevi[skupina]})`}
          </Gumb>
        </form>
      )}
    </Ploca>
  );
}
