import type { MetadataRoute } from "next";

/**
 * Lets the kiosk be added to the iPad's home screen and open with no
 * Safari chrome. iPadOS has no true fullscreen for web apps: it shows
 * "fullscreen" as standalone, with the status bar drawn over the page
 * (see `appleWebApp` in the layout), which the screens pad around.
 *
 * There is deliberately no service worker: the kiosk is useless without
 * the controller, and a cached shell would only risk serving a stale
 * kiosk after a deploy.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Photo booth",
    short_name: "Photo booth",
    description: "Tap, pose, print",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    background_color: "#0f1113",
    theme_color: "#0f1113",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
