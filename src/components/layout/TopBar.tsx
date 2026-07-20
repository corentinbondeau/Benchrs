"use client";

import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bell, Menu } from "lucide-react";
import Link from "next/link";
import { MobileNav } from "./MobileNav";

const roleLabels = {
  coach: "Coach",
  player: "Joueur",
  parent: "Parent",
};

const roleBadgeColors = {
  coach: "bg-[var(--gold)] text-[var(--gold-foreground)]",
  player: "bg-[var(--royal)] text-[var(--royal-foreground)]",
  parent: "bg-muted text-muted-foreground",
};

export function TopBar() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--gold)] text-[var(--gold-foreground)] font-bold text-sm lg:hidden">
          SP
        </div>
        <h1 className="text-lg font-semibold hidden sm:block">SportPlus</h1>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/notifications"
          className="relative rounded-full p-2 hover:bg-muted transition-colors"
        >
          <Bell className="h-5 w-5" />
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </span>
            <Badge
              variant="secondary"
              className={`text-xs ${roleBadgeColors[user?.role || "player"]}`}
            >
              {roleLabels[user?.role || "player"]}
            </Badge>
          </div>
          <Avatar className="h-9 w-9">
            <AvatarImage src={user?.avatarUrl || undefined} />
            <AvatarFallback className="bg-[var(--royal)] text-[var(--royal-foreground)] text-xs font-bold">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
