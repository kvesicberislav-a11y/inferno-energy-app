import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/** Oznaka verzije iz public/verzija.json (nastaje pri izgradnji, scripts/verzija.mjs); u razvoju "dev". */
function oznakaVerzije() {
  try {
    const { verzija } = JSON.parse(readFileSync("public/verzija.json", "utf8"));
    return typeof verzija === "string" && process.env.NODE_ENV === "production" ? verzija : "dev";
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  // ugrađuje se u aplikaciju: oznaka na dnu stranice i provjera nove verzije (NovaVerzija.tsx)
  env: { VERZIJA_APLIKACIJE: oznakaVerzije() },
  // Cache Components je isključen: na Cloudflare Workers zapinje
  // ("Worker's code had hung"), a našim stranicama nije potreban.
  cacheComponents: false,
  // Cloudflare besplatni plan nema optimizaciju slika, pa slike idu kakve jesu.
  images: { unoptimized: true },
  // Sigurnosna zaglavlja za sve stranice i API (public/_headers vrijedi samo za statične datoteke)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // kamera samo za skener barkoda u našoj aplikaciji; ostalo isključeno
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
