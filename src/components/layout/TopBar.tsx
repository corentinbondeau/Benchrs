"use client";

import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, User } from "lucide-react";

export function TopBar() {
  const { user, signOut } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const router = useRouter();

  const initials = user?.profile
    ? `${user.profile.first_name[0]}${user.profile.last_name[0]}`
    : "??";

  return (
    <header
      className="border-b bg-[var(--color-navy)] lg:border-border lg:bg-background"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex h-10 items-center gap-2.5 px-3 lg:h-12 lg:px-6">
        <img src="/logo.svg" alt="Benchrs" className="h-8 w-8 shrink-0 lg:hidden" />
        <span className="text-lg font-bold text-white leading-none shrink-0 lg:hidden">Benchrs</span>
        <div className="flex-1" />
        {currentTeam && (
          <span className="hidden lg:block text-sm text-muted-foreground truncate">
            {currentTeam.club?.name ? `${currentTeam.club.name} — ` : ""}{currentTeam.name}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="relative h-9 w-9 rounded-full" />}>
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[var(--color-royal)] text-white text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">
                {user?.profile?.first_name} {user?.profile?.last_name}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {userRole === "owner" ? "owner" : (userRole || "player")}
              </p>
            </div>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Paramètres
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/stats/my")}>
              <User className="mr-2 h-4 w-4" />
              Mon profil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
