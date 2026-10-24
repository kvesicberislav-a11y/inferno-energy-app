import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "INFERNO ENERGY",
    short_name: "INFERNO",
    description: "Prehrana, treninzi i napredak – INFERNO ENERGY",
    lang: "hr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/ikone/ikona-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ikone/ikona-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/ikone/ikona-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
