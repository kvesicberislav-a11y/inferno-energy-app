"use client";

import { useEffect } from "react";

/** Registrira service worker (samo u objavljenoj verziji). */
export function RegistracijaSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Bez service workera aplikacija i dalje radi normalno.
    });
  }, []);
  return null;
}
