import { AuthProvider } from "@/lib/auth";
import { TeamProvider } from "@/lib/team";
import { TeamGuard } from "@/components/team-guard";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { PushNotificationInit } from "@/components/PushNotificationInit";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <TeamProvider>
        <TeamGuard>
          <PushNotificationInit />
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-y-auto overflow-x-clip p-3 md:p-4 lg:p-6 pb-20 lg:pb-6">{children}</main>
              <BottomNav />
            </div>
          </div>
        </TeamGuard>
      </TeamProvider>
    </AuthProvider>
  );
}
