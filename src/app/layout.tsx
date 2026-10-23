import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import ThemeKeeper from "@/components/ThemeKeeper";

// Self-hosted at build time (no request to Google at runtime); exposed to Tailwind as --font-sans.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "TailorBid",
  description: "Tailored resumes, cover letters and job descriptions for full-time applications",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body>
        <ThemeKeeper />
        {children}
      </body>
    </html>
  );
}
