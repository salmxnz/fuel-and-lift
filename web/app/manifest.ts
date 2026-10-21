import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "adebite",
    short_name: "adebite",
    description: "Private calorie and gym tracker for you and a few friends.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBEFF3",
    theme_color: "#FBEFF3",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Log food", url: "/today?add=food", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Start workout", url: "/gym", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  }
}
