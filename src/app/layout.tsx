import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "INFERNO ENERGY",
  description: "Prehrana, treninzi i napredak – INFERNO ENERGY",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hr" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-pozadina font-sans text-tekst">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
