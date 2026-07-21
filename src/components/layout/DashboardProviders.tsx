"use client";

import { ParentChildProvider } from "@/components/layout/ParentChildProvider";

export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return <ParentChildProvider>{children}</ParentChildProvider>;
}
