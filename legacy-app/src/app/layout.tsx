import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// Fork legacy : pas de next/font/google (téléchargement réseau au build +
// polices Geist indisponibles en Next 14). On utilise une font-stack système
// via les variables --font-geist-sans/mono définies dans globals.css.
const geistSans = { variable: "font-legacy-sans" };
const geistMono = { variable: "font-legacy-mono" };

// Fork legacy : l'app est entièrement client-side + Supabase runtime. On
// désactive le prérendu statique (qui échoue au build faute de vraies clés
// Supabase et n'apporte aucun bénéfice ici) en forçant le rendu dynamique.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Benchrs",
  description: "Gestion d'équipe de football amateur",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
    { rel: "icon", url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    { rel: "icon", url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    { rel: "apple-touch-icon", url: "/icons/icon-180.png", type: "image/png", sizes: "180x180" },
    { rel: "apple-touch-icon", url: "/icons/icon-152.png", type: "image/png", sizes: "152x152" },
    { rel: "apple-touch-icon", url: "/icons/icon-144.png", type: "image/png", sizes: "144x144" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Benchrs",
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
          <Toaster
            position="top-center"
            richColors
            offset={72}
            mobileOffset={72}
            toastOptions={{ style: { marginTop: "0px" } }}
          />
          <InstallPrompt />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
