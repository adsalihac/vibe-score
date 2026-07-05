import type { Metadata } from "next";
import { JetBrains_Mono, VT323 } from "next/font/google";
import "./globals.css";

const displayFont = VT323({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const monoFont = JetBrains_Mono({
  variable: "--font-terminal",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const codeFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VibeScore - Bitcoin DeFi Repo Intelligence",
  description:
    "Measure repository health, risk, maintainability, dependency posture, and production readiness with a premium Bitcoin DeFi visual system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${monoFont.variable} ${codeFont.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-mono">{children}</body>
    </html>
  );
}
