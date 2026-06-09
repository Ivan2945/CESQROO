import type { MetadataRoute } from "next";

// Web app manifest — makes the portal installable (add to home screen) so the
// scoring screen can run full-screen and offline at the showground.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CESQROO Calificación",
    short_name: "CESQROO",
    description: "Calificación de concursos de salto — funciona sin conexión.",
    start_url: "/admin/events",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
