import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jamify",
  description: "Manage custom playlists in Spotify with Gemini",
  applicationName: "Jamify",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Jamify",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#1db954",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-zinc-950 text-zinc-50 antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
