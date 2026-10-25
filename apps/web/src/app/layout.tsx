import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";

import { I18nProvider } from "@/i18n/provider";

import "./globals.css";

// Same faces as acta.build and the dApp, so every ACTA surface reads as one system.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "ACTA Gate",
  description: "Let any Soroban contract require a valid verifiable credential.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <head>
        {/* Restores the chosen theme before the first paint. Dark is the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{if(localStorage.getItem("theme")!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning className="min-h-full bg-background font-sans text-foreground">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
