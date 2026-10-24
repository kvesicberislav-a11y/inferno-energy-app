"use client";

import { useEffect, useEffectEvent, type ReactNode } from "react";

/** Ploča koja izlazi s dna ekrana (kao na mobilnim aplikacijama). */
export function Ploca({
  naslov,
  onZatvori,
  children,
}: {
  naslov: string;
  onZatvori: () => void;
  children: ReactNode;
}) {
  const zatvoriTipkom = useEffectEvent(() => onZatvori());

  useEffect(() => {
    const prijasnji = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const naTipku = (e: KeyboardEvent) => {
      if (e.key === "Escape") zatvoriTipkom();
    };
    window.addEventListener("keydown", naTipku);
    return () => {
      document.body.style.overflow = prijasnji;
      window.removeEventListener("keydown", naTipku);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Zatvori"
        className="absolute inset-0 bg-black/70"
        onClick={onZatvori}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={naslov}
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-rub bg-povrsina px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{naslov}</h2>
          <button
            type="button"
            onClick={onZatvori}
            aria-label="Zatvori"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-povrsina-2 text-lg text-tekst-2"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
