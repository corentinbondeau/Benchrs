"use client";

import { useAuth } from "@/lib/auth";
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
import { MobileNav } from "./MobileNav";

export function TopBar() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const initials = user?.profile
    ? `${user.profile.first_name[0]}${user.profile.last_name[0]}`
    : "??";

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <MobileNav />
      <div className="flex-1" />
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
              {user?.profile?.role}
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
    </header>
  );
}
