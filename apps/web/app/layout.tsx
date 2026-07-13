import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans, Spline_Sans_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { GrainOverlay } from "@/components/ui/grain-overlay";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  display: "swap",
});

const grotesk = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

const dataMono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-data",
  display: "swap",
});

const SITE = "https://occestra.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Occestra — Every moment, made monumental.",
    template: "%s · Occestra",
  },
  description:
    "The Occasion Studio. Give it any moment — a birthday next Saturday, a product launching Friday, a trip just taken — and a syndicate of studio roles returns finished, grounded, quality-graded work with on-chain provenance.",
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Occestra",
    title: "Occestra — Every moment, made monumental.",
    description:
      "Finished, grounded, quality-graded occasion work. Graded by a published standard, repaired until it passes, sealed on X Layer.",
    images: [{ url: "/og.jpg", width: 1200, height: 800, alt: "Occestra — the Occasion Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Occestra — Every moment, made monumental.",
    description:
      "Finished, grounded, quality-graded occasion work with on-chain provenance on X Layer.",
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF7F2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${grotesk.variable} ${dataMono.variable}`}>
      <body>
        {children}
        <GrainOverlay />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#FAF7F2",
              color: "#17141A",
              border: "1px solid rgb(23 20 26 / 0.14)",
              boxShadow: "0 8px 24px -8px rgb(23 20 26 / 0.16)",
              fontFamily: "var(--font-grotesk)",
            },
          }}
        />
      </body>
    </html>
  );
}
