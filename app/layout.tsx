import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DensityProvider } from "@/components/theme/density-provider";
import { NoFlashScript } from "@/components/theme/no-flash-script";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { UnsavedDraftsGuard } from "@/components/shell/unsaved-drafts-guard";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
