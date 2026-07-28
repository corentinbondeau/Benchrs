import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { InstallPrompt } from "@/components/InstallPrompt";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SportPlus",
  description: "Gestion d'équipe de football amateur",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    { rel: "icon", url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    { rel: "apple-touch-icon", url: "/icons/icon-180.png", type: "image/png", sizes: "180x180" },
    { rel: "apple-touch-icon", url: "/icons/icon-152.png", type: "image/png", sizes: "152x152" },
    { rel: "apple-touch-icon", url: "/icons/icon-144.png", type: "image/png", sizes: "144x144" },
    { rel: "mask-icon", url: "/icons/icon.svg", color: "#EAB308" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SportPlus",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0F172A",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster position="top-right" richColors />
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
