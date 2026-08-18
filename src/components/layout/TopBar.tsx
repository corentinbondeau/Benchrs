"use client";

import Image from "next/image";
import { memo } from "react";
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
import { LogOut, Settings, User, Bell } from "lucide-react";
import Link from "next/link";

function TopBar() {
  const { user, signOut } = useAuth();
  const { currentTeam, userRole, clubMemberships } = useTeam();
  const router = useRouter();

  const isComiteOnly = clubMemberships.length > 0 && userRole === null;

  const initials = user?.profile
    ? `${user.profile.first_name?.[0] || ""}${user.profile.last_name?.[0] || ""}`
    : "??";

  return (
    <header
      className="border-b border-white/[0.08] bg-[var(--color-navy)] lg:border-border lg:bg-background"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex h-12 items-center gap-3 px-4 lg:h-14 lg:px-6">
        {/* Mobile: team logo + name */}
        {currentTeam?.logo_url ? (
          <Image src={currentTeam.logo_url} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg object-cover lg:hidden" />
        ) : (
          <Image src="/logo.svg" alt="Benchrs" width={28} height={28} priority className="h-7 w-7 shrink-0 lg:hidden" />
        )}
        <span className="text-sm font-bold text-white leading-none shrink-0 lg:hidden truncate max-w-[45vw]">
          {currentTeam?.name || "Benchrs"}
        </span>

        <div className="flex-1" />

        {/* Desktop: team info */}
        {currentTeam && (
          <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground mr-2">
            {currentTeam.logo_url && (
              <Image src={currentTeam.logo_url} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded object-cover" />
            )}
            <span className="truncate max-w-[300px]">
              {currentTeam.club?.name ? `${currentTeam.club.name} — ` : ""}{currentTeam.name}
            </span>
          </div>
        )}

        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative flex items-center justify-center h-9 w-9 rounded-lg text-white/50 lg:text-muted-foreground hover:bg-white/[0.06] lg:hover:bg-muted transition-colors"
        >
          <Bell className="h-[18px] w-[18px]" />
        </Link>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="relative h-9 w-9 rounded-full p-0" />}>
            <Avatar className="h-8 w-8">
              {user?.profile?.avatar_url ? (
                <Image src={user.profile.avatar_url} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <AvatarFallback className="bg-[var(--color-primary-blue)] text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">
                {user?.profile?.first_name} {user?.profile?.last_name}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {isComiteOnly ? "Comite" : (userRole === "owner" ? "Coach" : (userRole || "Joueur"))}
              </p>
            </div>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Parametres
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/stats/my")}>
              <User className="mr-2 h-4 w-4" />
              Mon profil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Deconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export default memo(TopBar);
