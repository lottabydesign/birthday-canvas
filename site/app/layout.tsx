import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kamsbirthday.vercel.app"),
  title: "kamsbirthday.co — a corner of the internet for kam",
  description: "A little 2D desktop of memories from the people who love Kam.",
  openGraph: {
    title: "Happy birthday, Kam.",
    description: "A little corner of the internet, made of memories from the people who love you.",
    siteName: "kamsbirthday.co",
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Happy birthday, Kam.",
    description: "A little corner of the internet, made of memories from the people who love you.",
  },
};

// Inline script that runs synchronously during HTML parse, BEFORE the browser
// paints anything. It checks localStorage + URL for "have they seen the intro?"
// and stamps <html data-intro-skip="1"> if so. A CSS rule uses that attribute
// to hide the dark intro overlay before first paint — eliminating the brief
// dark flash return visitors used to see between paint and React hydration.
// Same pattern dark-mode-toggle sites use to avoid theme flicker.
//
// Content is a hardcoded string literal (no user input), so the React inline-
// script API used below is XSS-safe in this usage.
const INTRO_SKIP_SCRIPT =
  "try{var u=new URL(location.href);if(!u.searchParams.has('intro')&&localStorage.getItem('kams-intro-shown')==='1'){document.documentElement.dataset.introSkip='1';}}catch(e){}";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${jetbrains.variable}`}>
      <head>
        {/* eslint-disable-next-line react/no-danger */}
        <script
          // The string is a static literal defined above; no user input flows in.
          dangerouslySetInnerHTML={{ __html: INTRO_SKIP_SCRIPT }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
