// INFERNO ENERGY – service worker
// - stranice uvijek s mreže (podaci moraju biti svježi); bez interneta -> /offline.html
// - nepromjenjive datoteke (/_next/static, ikone) iz predmemorije za brže otvaranje
// - obavijesti na mobitel (nova poruka) i otvaranje aplikacije dodirom na obavijest
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

// Obavijest s poslužitelja → prikaži je na mobitelu
self.addEventListener("push", (dogadaj) => {
  let podaci = {};
  try {
    podaci = dogadaj.data ? dogadaj.data.json() : {};
  } catch {
    podaci = { body: dogadaj.data ? dogadaj.data.text() : "" };
  }
  dogadaj.waitUntil(
    self.registration.showNotification(podaci.title || "INFERNO ENERGY", {
      body: podaci.body || "",
      icon: "/ikone/ikona-192.png",
      badge: "/ikone/znacka-96.png",
      tag: podaci.tag || "poruke",
      renotify: true,
      data: { url: podaci.url || "/" },
    }),
  );
});

// Dodir na obavijest → otvori aplikaciju na pravoj stranici
self.addEventListener("notificationclick", (dogadaj) => {
  dogadaj.notification.close();
  let cilj = new URL("/", self.location.origin);
  try {
    const url = new URL((dogadaj.notification.data && dogadaj.notification.data.url) || "/", self.location.origin);
    if (url.origin === self.location.origin) cilj = url; // samo stranice naše aplikacije
  } catch {
    // ostaje početna stranica
  }
  dogadaj.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (prozori) => {
      const otvoren = prozori.find((p) => new URL(p.url).origin === self.location.origin);
      if (otvoren) {
        await otvoren.focus();
        if ("navigate" in otvoren) await otvoren.navigate(cilj.href).catch(() => {});
        return;
      }
      await self.clients.openWindow(cilj.href);
    }),
  );
});
