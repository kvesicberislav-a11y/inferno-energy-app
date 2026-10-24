"use client";

import { useRef, useState, type FormEvent } from "react";
import { Ploca } from "@/components/Ploca";
import { Cip, Gumb, Polje, PoljeTeksta, Poruka } from "@/components/ui";
import { prevediGresku } from "@/lib/greske";
import { obrisiSlikuVjezbe, ucitajSlikuVjezbe } from "@/lib/slike";
import { supabase } from "@/lib/supabase/client";
import { MISICNE_SKUPINE, jeGreskaVeze, youtubeId, type Vjezba } from "@/lib/treninzi";
import { SlicicaVjezbe } from "./VideoVjezbe";

/** Trener dodaje ili uređuje vježbu u biblioteci. */
export function VjezbaForma({
  postojeca,
  onZatvori,
  onSpremljeno,
}: {
  postojeca: Vjezba | null;
  onZatvori: () => void;
  onSpremljeno: () => void;
}) {
  const [naziv, setNaziv] = useState(postojeca?.naziv ?? "");
  const [skupina, setSkupina] = useState(postojeca?.misicna_skupina ?? "");
  const [opis, setOpis] = useState(postojeca?.opis ?? "");
  const [youtube, setYoutube] = useState(postojeca?.youtube_url ?? "");
  const [slikaUrl, setSlikaUrl] = useState<string | null>(postojeca?.slika_url ?? null);
  const [novaSlika, setNovaSlika] = useState<File | null>(null);
  const [pregledSlike, setPregledSlike] = useState<string | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [salje, setSalje] = useState(false);
  const odabirDatoteke = useRef<HTMLInputElement>(null);

  const ytId = youtubeId(youtube);

  function odaberiSliku(datoteka: File | undefined) {
    if (!datoteka) return;
    if (!datoteka.type.startsWith("image/")) return setGreska("Odaberi sliku (JPG, PNG ili WebP).");
    if (pregledSlike) URL.revokeObjectURL(pregledSlike);
    setNovaSlika(datoteka);
    setPregledSlike(URL.createObjectURL(datoteka));
    setGreska(null);
  }

  function ukloniSliku() {
    if (pregledSlike) URL.revokeObjectURL(pregledSlike);
    setNovaSlika(null);
    setPregledSlike(null);
    setSlikaUrl(null);
  }

  async function spremi(e: FormEvent) {
    e.preventDefault();
    setGreska(null);
    if (!naziv.trim()) return setGreska("Upiši naziv vježbe.");
    if (!skupina) return setGreska("Odaberi mišićnu skupinu.");
    if (youtube.trim() && !ytId) return setGreska("YouTube link nije ispravan.");

    setSalje(true);
    try {
      let konacnaSlika = slikaUrl;
      if (novaSlika) konacnaSlika = await ucitajSlikuVjezbe(novaSlika);

      const podaci = {
        naziv: naziv.trim().slice(0, 80),
        misicna_skupina: skupina,
        opis: opis.trim().slice(0, 2000),
        youtube_url: youtube.trim() || null,
        slika_url: konacnaSlika,
      };
      const sb = supabase();
      const { error } = postojeca
        ? await sb.from("vjezbe").update(podaci).eq("id", postojeca.id)
        : await sb.from("vjezbe").insert(podaci);
      if (error) throw new Error(error.message);

      // Stara slika više ne treba.
      if (postojeca?.slika_url && postojeca.slika_url !== konacnaSlika) {
        await obrisiSlikuVjezbe(postojeca.slika_url);
      }
      onSpremljeno();
    } catch (err) {
      setGreska(prevediGresku(err instanceof Error ? err.message : null));
    } finally {
      setSalje(false);
    }
  }

  async function obrisi() {
    if (!postojeca || !window.confirm(`Obrisati vježbu „${postojeca.naziv}”?`)) return;
    setSalje(true);
    const { error } = await supabase().from("vjezbe").delete().eq("id", postojeca.id);
    setSalje(false);
    if (error) {
      return setGreska(
        jeGreskaVeze(error.message)
          ? "Vježba se koristi u planu ili u odrađenim treninzima, pa se ne može obrisati."
          : prevediGresku(error.message),
      );
    }
    await obrisiSlikuVjezbe(postojeca.slika_url);
    onSpremljeno();
  }

  const prikazSlike = pregledSlike ?? slikaUrl;

  return (
    <Ploca naslov={postojeca ? "Uredi vježbu" : "Nova vježba"} onZatvori={onZatvori}>
      <form onSubmit={spremi} className="flex flex-col gap-5">
        <Polje
          id="vjezba-naziv"
          oznaka="Naziv"
          placeholder="npr. Čučanj sa šipkom"
          maxLength={80}
          value={naziv}
          onChange={(e) => setNaziv(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Mišićna skupina</span>
          <div className="flex flex-wrap gap-2">
            {MISICNE_SKUPINE.map((s) => (
              <Cip key={s} aktivan={skupina === s} onClick={() => setSkupina(s)}>
                {s}
              </Cip>
            ))}
          </div>
        </div>

        <PoljeTeksta
          id="vjezba-opis"
          oznaka="Kratki opis izvedbe"
          placeholder="Stopala u širini ramena, leđa ravna…"
          maxLength={2000}
          value={opis}
          onChange={(e) => setOpis(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <Polje
            id="vjezba-youtube"
            oznaka="YouTube link (neobavezno)"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            placeholder="https://youtu.be/…"
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
          />
          {youtube.trim() && (
            <p className={`text-sm ${ytId ? "text-emerald-300" : "text-red-300"}`}>
              {ytId ? "✓ Video prepoznat" : "Link nije prepoznat kao YouTube video"}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-tekst-2">Slika (neobavezno)</span>
          <div className="flex items-center gap-3">
            <SlicicaVjezbe slikaUrl={prikazSlike} youtubeUrl={null} className="h-20 w-20" />
            <div className="flex flex-col gap-2">
              <Gumb type="button" varijanta="sporedni" malen onClick={() => odabirDatoteke.current?.click()}>
                {prikazSlike ? "Promijeni sliku" : "Dodaj sliku"}
              </Gumb>
              {prikazSlike && (
                <button type="button" onClick={ukloniSliku} className="text-left text-sm text-red-300">
                  Ukloni sliku
                </button>
              )}
            </div>
          </div>
          <input
            ref={odabirDatoteke}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              odaberiSliku(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {greska && <Poruka tip="greska">{greska}</Poruka>}

        <Gumb type="submit" disabled={salje}>
          {salje ? "Spremam…" : "Spremi vježbu"}
        </Gumb>
        {postojeca && (
          <Gumb type="button" varijanta="opasni" onClick={obrisi} disabled={salje}>
            Obriši vježbu
          </Gumb>
        )}
      </form>
    </Ploca>
  );
}
