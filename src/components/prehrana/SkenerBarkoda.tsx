"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Ploca } from "@/components/Ploca";
import { Gumb, Poruka } from "@/components/ui";
import { ispravanBarkod } from "@/lib/namirnice";

type Detektor = { detect: (izvor: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const FORMATI = ["ean_13", "ean_8", "upc_a", "upc_e"];

/** Android/Chrome ima ugrađen čitač; iPhone (Safari) nema, pa se učita naša biblioteka. */
async function napraviDetektor(): Promise<Detektor> {
  const ugradeni = (globalThis as { BarcodeDetector?: { new (o: unknown): Detektor; getSupportedFormats?: () => Promise<string[]> } })
    .BarcodeDetector;
  if (ugradeni?.getSupportedFormats) {
    try {
      const podrzani = await ugradeni.getSupportedFormats();
      if (podrzani.includes("ean_13")) return new ugradeni({ formats: FORMATI });
    } catch {
      // prelazi na biblioteku
    }
  }
  const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (putanja: string, prefiks: string) =>
        putanja.endsWith(".wasm") ? `/zxing/${ZXING_WASM_VERSION}/${putanja}` : prefiks + putanja,
    },
  });
  return new BarcodeDetector({ formats: FORMATI as never }) as unknown as Detektor;
}

/** Skeniranje barkoda kamerom (stražnja kamera). Ima i ručni upis broja. */
export function SkenerBarkoda({ onBarkod, onZatvori }: { onBarkod: (kod: string) => void; onZatvori: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stanje, setStanje] = useState<"pokretanje" | "skenira" | "greska">("pokretanje");
  const [greska, setGreska] = useState<string | null>(null);
  const [rucno, setRucno] = useState("");
  const pozovi = useRef(onBarkod);

  useEffect(() => {
    pozovi.current = onBarkod;
  }, [onBarkod]);

  useEffect(() => {
    let aktivno = true;
    let tok: MediaStream | null = null;
    let odbrojavanje: ReturnType<typeof setTimeout> | null = null;

    async function pokreni() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("bez-kamere");
        tok = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!aktivno || !video.current) return;
        video.current.srcObject = tok;
        await video.current.play();
        const detektor = await napraviDetektor();
        if (!aktivno) return;
        setStanje("skenira");

        const trazi = async () => {
          if (!aktivno || !video.current) return;
          try {
            if (video.current.readyState >= 2) {
              const nadeno = await detektor.detect(video.current);
              const kod = nadeno.map((n) => n.rawValue).find(ispravanBarkod);
              if (kod && aktivno) {
                aktivno = false;
                navigator.vibrate?.(60);
                pozovi.current(kod);
                return;
              }
            }
          } catch {
            // pojedinačni promašaj – pokušaj ponovno
          }
          odbrojavanje = setTimeout(trazi, 250);
        };
        trazi();
      } catch (e) {
        if (!aktivno) return;
        const ime = e instanceof DOMException ? e.name : "";
        setStanje("greska");
        setGreska(
          ime === "NotAllowedError"
            ? "Pristup kameri nije dopušten. Dopusti kameru za ovu stranicu u postavkama preglednika ili upiši barkod ručno."
            : ime === "NotFoundError" || (e instanceof Error && e.message === "bez-kamere")
              ? "Kamera nije dostupna. Upiši broj ispod barkoda ručno."
              : "Kamera se ne može pokrenuti. Upiši barkod ručno.",
        );
      }
    }
    pokreni();

    return () => {
      aktivno = false;
      if (odbrojavanje) clearTimeout(odbrojavanje);
      tok?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function posaljiRucno(e: FormEvent) {
    e.preventDefault();
    const kod = rucno.replace(/\D/g, "");
    if (!ispravanBarkod(kod)) return setGreska("Upiši broj ispod barkoda (8–13 znamenki).");
    onBarkod(kod);
  }

  return (
    <Ploca naslov="Skeniraj barkod" onZatvori={onZatvori}>
      <div className="flex flex-col gap-4">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-rub bg-black">
          <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" />
          {stanje !== "greska" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-1/3 w-4/5 rounded-xl border-2 border-vatra/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {stanje === "pokretanje" && (
            <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white/80">Pokrećem kameru…</p>
          )}
        </div>
        {stanje === "skenira" && (
          <p className="-mt-2 text-center text-sm text-tekst-2">Usmjeri kameru na barkod na pakiranju.</p>
        )}
        {greska && <Poruka tip={stanje === "greska" ? "greska" : "info"}>{greska}</Poruka>}

        <form onSubmit={posaljiRucno} className="flex gap-2">
          <input
            aria-label="Barkod ručno"
            inputMode="numeric"
            placeholder="ili upiši broj barkoda"
            value={rucno}
            onChange={(e) => setRucno(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-2xl border border-rub bg-povrsina-2 px-4 text-base text-tekst outline-none placeholder:text-zinc-600 focus:border-vatra"
          />
          <Gumb type="submit" varijanta="sporedni" malen>
            Traži
          </Gumb>
        </form>
      </div>
    </Ploca>
  );
}
