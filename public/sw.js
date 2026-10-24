// INFERNO ENERGY – service worker
// - stranice uvijek s mreže (podaci moraju biti svježi); bez interneta -> /offline.html
// - nepromjenjive datoteke (/_next/static, ikone) iz predmemorije za brže otvaranje
const PREDMEMORIJA = "inferno-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (dogadaj) => {
  dogadaj.waitUntil(
    caches
      .open(PREDMEMORIJA)
      .then((c) => c.addAll([OFFLINE, "/ikone/ikona-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (dogadaj) => {
  dogadaj.waitUntil(
    caches
      .keys()
      .then((kljucevi) => Promise.all(kljucevi.filter((k) => k !== PREDMEMORIJA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (dogadaj) => {
  const zahtjev = dogadaj.request;
  if (zahtjev.method !== "GET") return;
  const url = new URL(zahtjev.url);
  if (url.origin !== self.location.origin) return; // Supabase, YouTube… idu ravno na mrežu

  // Otvaranje stranice: mreža, a bez interneta poruka
  if (zahtjev.mode === "navigate") {
    dogadaj.respondWith(fetch(zahtjev).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Nepromjenjive datoteke: prvo predmemorija
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/ikone/")) {
    dogadaj.respondWith(
      caches.match(zahtjev).then(
        (spremljeno) =>
          spremljeno ||
          fetch(zahtjev).then((odgovor) => {
            if (odgovor.ok) {
              const kopija = odgovor.clone();
              caches.open(PREDMEMORIJA).then((c) => c.put(zahtjev, kopija));
            }
            return odgovor;
          }),
      ),
    );
  }
});
