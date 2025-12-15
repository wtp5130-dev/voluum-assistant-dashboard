import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import ClientClerkProvider from "@/components/ClientClerkProvider";

// If you’re using a font like Inter from next/font, keep your import here.
// import { Inter } from "next/font/google";
// const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PropellarAds Sidekick",
  description: "AI-powered assistant for Voluum + PropellerAds optimization.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Allow configuring the background image via env var or default to /bg.jpg
  const bgUrl = process.env.NEXT_PUBLIC_BACKGROUND_IMAGE_URL || "/bg.jpg";
  return (
    <ClientClerkProvider>
      <html lang="en">
        {/* If you’re using a font, add className={inter.className} */}
        <body
          style={{
            // Expose as CSS variable so globals.css can pick it up
            // @ts-ignore - custom CSS var
            "--app-bg-image": `url('${bgUrl}')`,
          }}
        >
          <NavBar />
          <div className="pt-3">{children}</div>
        </body>
      </html>
    </ClientClerkProvider>
  );
}
