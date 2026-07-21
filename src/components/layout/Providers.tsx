"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PwaRegistrar } from "@/components/PwaRegistrar";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SessionProvider>
        <PwaRegistrar />
        {children}
        <Toaster position="top-right" richColors />
      </SessionProvider>
    </ThemeProvider>
  );
}
