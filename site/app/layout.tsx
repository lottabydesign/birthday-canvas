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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
