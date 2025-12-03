import type { Metadata } from "next";
import "./globals.css";

// If you’re using a font like Inter from next/font, keep your import here.
// import { Inter } from "next/font/google";
// const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PropellarAds Dashboard", // 👈 change this to whatever you want
  description: "AI-powered assistant for Voluum + PropellerAds optimization.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* If you’re using a font, add className={inter.className} */}
      <body>{children}</body>
    </html>
  );
}
