import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
 * Fonts are files in the repo rather than next/font/google: the build
 * fetches nothing, and the kiosk draws the same glyphs on the night
 * whatever the venue's connection is doing. All three are variable
 * fonts, so one file each covers every weight a screen uses.
 */
const bodoni = localFont({
  src: [
    { path: "../assets/fonts/BodoniModa.ttf", style: "normal" },
    { path: "../assets/fonts/BodoniModa-Italic.ttf", style: "italic" },
  ],
  variable: "--font-bodoni",
  display: "swap",
});

const instrument = localFont({
  src: [
    { path: "../assets/fonts/InstrumentSans.ttf", style: "normal" },
    { path: "../assets/fonts/InstrumentSans-Italic.ttf", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
});

const geistMono = localFont({
  src: "../assets/fonts/GeistMono.ttf",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Photo booth",
  description: "Tap, pose, print",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Photo booth" },
};

export const viewport: Viewport = {
  themeColor: "#0d0a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodoni.variable} ${instrument.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
