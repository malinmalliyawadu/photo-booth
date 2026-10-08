import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
 * Fonts are files in the repo rather than next/font/google: the build
 * fetches nothing, and the kiosk draws the same glyphs on the night
 * whatever the venue's connection is doing.
 */
const fraunces = localFont({
  src: [
    { path: "../assets/fonts/Fraunces.ttf", style: "normal" },
    { path: "../assets/fonts/Fraunces-Italic.ttf", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

const figtree = localFont({
  src: "../assets/fonts/Figtree.ttf",
  variable: "--font-figtree",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../assets/fonts/IBMPlexMono-Regular.ttf", weight: "400" },
    { path: "../assets/fonts/IBMPlexMono-Medium.ttf", weight: "500" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Photo booth",
  description: "Tap, pose, print",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Photo booth" },
};

export const viewport: Viewport = {
  themeColor: "#0f1113",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${figtree.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
