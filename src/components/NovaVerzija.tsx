"use client";

import { useEffect, useState } from "react";

/** Oznaka ove verzije (trenutak izgradnje, next.config.ts); u razvoju "dev". */
const VERZIJA = process.env.VERZIJA_APLIKACIJE ?? "dev";
/** Za koju je novu verziju stranica već jednom osvježena (da se ne osvježava u krug). */
const KLJUC = "inferno-osvjezeno-za";
const PROVJERA_MS = 5 * 60_000;
const NAJCESCE_MS = 30_000;

/** "2026-11-26T13:45:12Z" -> "26. 11. 14:45" (vrijeme u Hrvatskoj) */
export function opisVerzije(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const dio = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zagreb",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${dio.day}. ${dio.month}. ${dio.hour}:${dio.minute}`;
}

/** Smije li se stranica sad osvježiti: nije otvoren nijedan prozor i ništa se ne upisuje. */
function mirno() {
  if (document.querySelector('[role="dialog"]')) return false;
  const a = document.activeElement;
  return !(
    a instanceof HTMLInputElement ||
    a instanceof HTMLTextAreaElement ||
    a instanceof HTMLSelectElement ||
    (a instanceof HTMLElement && a.isContentEditable)
  );
}

/**
 * Oznaka verzije na dnu svake stranice, i samo-osvježavanje: kad se aplikaciji vrati
 * (i svakih 5 min dok je otvorena) provjeri ima li na poslužitelju novija verzija;
 * ako ima, osvježi se čim nije otvoren nijedan prozor i ništa se ne upisuje.
 */
export function NovaVerzija() {
  const [nova, setNova] = useState<string | null>(null);

  useEffect(() => {
    if (VERZIJA === "dev") return;
    let aktivno = true;
    let zadnja = 0;
    async function provjeri() {
      if (document.visibilityState !== "visible" || Date.now() - zadnja < NAJCESCE_MS) return;
      zadnja = Date.now();
      try {
        const r = await fetch(`/verzija.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const { verzija } = (await r.json()) as { verzija?: unknown };
        if (aktivno && typeof verzija === "string" && verzija !== VERZIJA) setNova(verzija);
      } catch {
        // bez interneta: provjera idući put
      }
    }
    provjeri();
    const sat = setInterval(provjeri, PROVJERA_MS);
    document.addEventListener("visibilitychange", provjeri);
    window.addEventListener("focus", provjeri);
    return () => {
      aktivno = false;
      clearInterval(sat);
      document.removeEventListener("visibilitychange", provjeri);
      window.removeEventListener("focus", provjeri);
    };
  }, []);

  useEffect(() => {
    // jednom po novoj verziji; ako ni nakon toga nije nova, ostaje gumb za ručno osvježavanje
    if (!nova || sessionStorage.getItem(KLJUC) === nova) return;
    const sat = setInterval(() => {
      if (!mirno()) return;
      clearInterval(sat);
      sessionStorage.setItem(KLJUC, nova);
      window.location.reload();
    }, 1000);
    return () => clearInterval(sat);
  }, [nova]);

  return (
    <footer className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-zinc-500">
      {nova ? (
        <button type="button" onClick={() => window.location.reload()} className="font-semibold text-vatra underline">
          Nova verzija je spremna – dodirni za osvježavanje
        </button>
      ) : (
        `Verzija ${VERZIJA === "dev" ? "u razvoju" : opisVerzije(VERZIJA)}`
      )}
    </footer>
  );
}
