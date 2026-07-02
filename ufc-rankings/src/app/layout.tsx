import type { Metadata } from "next";
import { Geist, Geist_Mono, Oswald } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import { AnalystProvider } from "@/components/AnalystContext";
import AnalystDock from "@/components/AnalystDock";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display face — division banners + rank numerals (DESIGN_VISION §2.2)
const oswald = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "UFergC Rankings — AI-Powered UFC Fighter Rankings",
  description:
    "Top 40 UFC fighter rankings per weight class, powered by data-driven algorithms. No media votes, no bias — pure in-cage performance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnalystProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <AnalystDock />
        </AnalystProvider>
      </body>
    </html>
  );
}
