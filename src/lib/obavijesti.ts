import { prevediGresku } from "@/lib/greske";
import { supabase } from "@/lib/supabase/client";

/** Javni ključ za obavijesti (nije tajna – tajni par je samo na poslužitelju). */
const JAVNI_KLJUC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type StanjeObavijesti =
  | "nepoznato" // još ne znamo (prvo iscrtavanje)
  | "nepodrzano" // preglednik ne podržava obavijesti
  | "ios-instaliraj" // iPhone: obavijesti rade tek kad je aplikacija na početnom zaslonu
  | "blokirano" // korisnik je odbio obavijesti
  | "iskljuceno" // još nije odlučio
  | "ukljuceno";

function jeIphone() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function jeInstalirana() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function stanjeObavijesti(): StanjeObavijesti {
  const podrzano = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!podrzano || !JAVNI_KLJUC) return jeIphone() && !jeInstalirana() ? "ios-instaliraj" : "nepodrzano";
  if (Notification.permission === "denied") return "blokirano";
  if (Notification.permission === "granted") return "ukljuceno";
  return "iskljuceno";
}

function uBajtove(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (z) => z.charCodeAt(0));
}

function istiKljuc(a: ArrayBuffer | null, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

async function registracija() {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  return reg;
}

/** Pretplati ovaj uređaj na obavijesti i spremi ga u bazu. Vraća poruku greške ili null. */
export async function sinkronizirajPretplatu(): Promise<string | null> {
  try {
    const kljuc = uBajtove(JAVNI_KLJUC);
    const reg = await registracija();
    let pretplata = await reg.pushManager.getSubscription();
    if (pretplata && !istiKljuc(pretplata.options.applicationServerKey, kljuc)) {
      await pretplata.unsubscribe();
      pretplata = null;
    }
    if (!pretplata) {
      pretplata = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kljuc });
    }
    const j = pretplata.toJSON();
    const { error } = await supabase().rpc("spremi_pretplatu", {
      p_endpoint: j.endpoint,
      p_p256dh: j.keys?.p256dh,
      p_auth: j.keys?.auth,
    });
    return error ? prevediGresku(error.message) : null;
  } catch {
    return "Obavijesti se nisu uspjele uključiti. Pokušaj ponovno.";
  }
}

/** Gumb "Uključi obavijesti": pita dopuštenje pa pretplati uređaj. */
export async function ukljuciObavijesti(): Promise<string | null> {
  const dozvola = await Notification.requestPermission();
  if (dozvola !== "granted") return null; // stanje se vidi u kartici (blokirano / iskljuceno)
  return sinkronizirajPretplatu();
}

let sinkronizirano = false;

/** Jednom po otvaranju aplikacije: ako su obavijesti dopuštene, osvježi pretplatu ovog uređaja. */
export function osvjeziPretplatuJednom() {
  if (sinkronizirano || stanjeObavijesti() !== "ukljuceno") return;
  sinkronizirano = true;
  void sinkronizirajPretplatu();
}

/** Odjava: ovaj uređaj više ne prima obavijesti za tog korisnika. */
export async function iskljuciNaOvomUredaju() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const pretplata = await reg?.pushManager?.getSubscription();
    if (!pretplata) return;
    await supabase().rpc("obrisi_pretplatu", { p_endpoint: pretplata.endpoint });
    await pretplata.unsubscribe();
    sinkronizirano = false;
  } catch {
    // odjava mora proći i bez ovoga
  }
}
