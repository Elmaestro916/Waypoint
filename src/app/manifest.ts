import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Waypoint",
    short_name: "Waypoint",
    description: "Search once, see every store that sells it.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#14171f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
