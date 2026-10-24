import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components je isključen: na Cloudflare Workers zapinje
  // ("Worker's code had hung"), a našim stranicama nije potreban.
  cacheComponents: false,
  // Cloudflare besplatni plan nema optimizaciju slika, pa slike idu kakve jesu.
  images: { unoptimized: true },
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
