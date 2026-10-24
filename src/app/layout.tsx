import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { RegistracijaSW } from "@/components/RegistracijaSW";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "INFERNO ENERGY",
  description: "Prehrana, treninzi i napredak – INFERNO ENERGY",
  applicationName: "INFERNO ENERGY",
  appleWebApp: {
    capable: true,
    title: "INFERNO",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hr" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col bg-pozadina font-sans text-tekst">
        <AuthProvider>{children}</AuthProvider>
        <RegistracijaSW />
      </body>
    </html>
  );
}
