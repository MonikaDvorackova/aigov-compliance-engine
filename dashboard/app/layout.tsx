import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: {
    default: "GovAI",
    template: "%s | GovAI",
  },
  description: "Infrastructure-grade AI governance engine.",
  applicationName: "GovAI",
  keywords: [
    "AI governance",
    "AI Act",
    "compliance engine",
    "risk management",
    "ML infrastructure",
  ],
  authors: [{ name: "GovAI" }],
  creator: "GovAI",
  icons: {
    icon: "/aigov-icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
