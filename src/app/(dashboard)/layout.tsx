"use client";

import { AuthProvider } from "@/lib/auth";
import { TeamProvider } from "@/lib/team";
import { TeamGuard } from "@/components/team-guard";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import { PushNotificationInit } from "@/components/PushNotificationInit";
import { UniversalOnboarding } from "@/components/onboarding/UniversalOnboarding";
import { CityRequiredGuard } from "@/components/CityRequiredGuard";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useOfflineSync } from "@/lib/useOfflineQueue";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  useOfflineSync();

  return (
    <AuthProvider>
      <TeamProvider>
        <UniversalOnboarding />
        <CityRequiredGuard />
        <TeamGuard>
          <PushNotificationInit />
          <div className="flex h-screen overflow-hidden bg-background">
            {!isMobile && <Sidebar />}
            <div className="flex flex-1 flex-col overflow-hidden min-w-0">
              <TopBar />
              <main className="flex-1 overflow-y-auto overflow-x-clip">
                <div className="page-container px-4 py-4 md:px-6 md:py-5 lg:px-8 lg:py-6 pb-24 lg:pb-8">
                  <div className="animate-[fadeIn_0.2s_ease-out]">
                    {children}
                  </div>
                </div>
              </main>
              {isMobile && <BottomNav />}
            </div>
          </div>
        </TeamGuard>
      </TeamProvider>
    </AuthProvider>
  );
}
