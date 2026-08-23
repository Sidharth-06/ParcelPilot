import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Newsreader, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DocViewerProvider } from "@/components/doc-viewer-modal";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ParcelPilot Ops Console",
  description:
    "Internal AI support & operations console for ParcelPilot — retrieval over policies and contracts, deterministic SLA/credit engines, and guarded actions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${plusJakarta.variable} ${newsreader.variable} ${geistMono.variable} font-sans antialiased h-full bg-[#FAF8F5] text-[#1C1E21]`}>
        <TooltipProvider>
          <DocViewerProvider>{children}</DocViewerProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
