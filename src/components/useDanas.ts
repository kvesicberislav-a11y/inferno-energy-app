"use client";

import { useSyncExternalStore } from "react";
import { danasZagreb } from "@/lib/datum";

/** Javlja kad se aplikacija ponovno otvori, dobije fokus ili prođe minuta (provjera ponoći). */
function pretplata(obavijesti: () => void) {
  const naPovratak = () => {
    if (document.visibilityState === "visible") obavijesti();
  };
  document.addEventListener("visibilitychange", naPovratak);
  window.addEventListener("focus", obavijesti);
  const sat = setInterval(obavijesti, 60_000);
  return () => {
    document.removeEventListener("visibilitychange", naPovratak);
    window.removeEventListener("focus", obavijesti);
    clearInterval(sat);
  };
}

/**
 * Današnji datum (Zagreb) koji se sam osvježi nakon ponoći –
 * i kad je aplikacija ostala otvorena preko noći na mobitelu.
 */
export function useDanas(): string {
  return useSyncExternalStore(pretplata, danasZagreb, danasZagreb);
}
