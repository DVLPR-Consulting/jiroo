import type { Metadata } from "next";
import localFont from "next/font/local";
import { DensityProvider } from "@/components/theme/density-provider";
import { NoFlashScript } from "@/components/theme/no-flash-script";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { UnsavedDraftsGuard } from "@/components/shell/unsaved-drafts-guard";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/Geist-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Jiroo",
  description: "Gestion des tickets — Cour de cassation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <NoFlashScript />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <DensityProvider>{children}</DensityProvider>
          {/* Root level: still warns on /login after a session redirect. */}
          <UnsavedDraftsGuard />
        </ThemeProvider>
      </body>
    </html>
  );
}
