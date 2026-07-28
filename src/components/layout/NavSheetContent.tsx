"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { SheetContent, SheetClose } from "@/components/ui/sheet";
import { X } from "lucide-react";
import {
  BarChart3,
  Users,
  Heart,
  Car,
  ListTodo,
  Swords,
  Image,
  Trophy,
  Bell,
  Settings,
  UserCog,
  Wallet,
} from "lucide-react";

const navItems = [
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/convocations", label: "Convocations", icon: Users },
  { href: "/medical", label: "Infirmerie", icon: Heart },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/tasks", label: "Tâches", icon: ListTodo },
  { href: "/tactics", label: "Tactique", icon: Swords, coachOnly: true },
  { href: "/gallery", label: "Galerie", icon: Image },
  { href: "/trophies", label: "Trophées", icon: Trophy },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const coachItems = [
  { href: "/admin/players", label: "Gestion joueurs", icon: UserCog },
  { href: "/admin/cotisations", label: "Cotisations", icon: Wallet },
];

export function NavSheetContent() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentTeam, teams, switchTeam } = useTeam();
  const isCoach = user?.profile?.role === "coach";

  const close = useCallback(() => {
    const closeBtn = document.querySelector<HTMLButtonElement>('[data-nav-sheet-close]');
    closeBtn?.click();
  }, []);

  return (
    <SheetContent side="left" className="w-64 p-0 bg-[var(--color-navy)]" showCloseButton={false}>
      <SheetClose data-nav-sheet-close className="hidden" />
      <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="SportPlus" className="h-6 w-6" />
          <span className="text-lg font-bold text-white">SportPlus</span>
        </div>
        <SheetClose className="text-white/60 hover:text-white">
          <X className="h-5 w-5" />
        </SheetClose>
      </div>

      {currentTeam && (
        <div className="px-3 py-2 border-b border-white/10">
          {teams.length > 1 ? (
            <select
              value={currentTeam.id}
              onChange={(e) => {
                switchTeam(e.target.value);
                close();
              }}
              className="w-full bg-white/10 text-white text-sm rounded-lg px-3 py-2 appearance-none cursor-pointer hover:bg-white/15 transition-colors"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id} className="bg-[var(--color-navy)]">
                  {team.club?.name ? `${team.club.name} — ` : ""}{team.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{currentTeam.club?.name || currentTeam.name}</p>
              {currentTeam.club && (
                <p className="text-xs text-white/50">{currentTeam.name}</p>
              )}
            </div>
          )}
        </div>
      )}

      <nav className="py-3 px-2 space-y-0.5">
        {navItems
          .filter((item) => !item.coachOnly || isCoach)
          .map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {isCoach && (
        <>
          <div className="mx-2 border-t border-white/10" />
          <p className="px-4 py-1 text-xs font-semibold text-white/40 uppercase tracking-wider">
            Admin
          </p>
          <nav className="pb-3 px-2 space-y-0.5">
            {coachItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}

      <div className="border-t border-white/10 p-3 space-y-0.5">
        <Link
          href="/settings"
          onClick={close}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          Mon profil
        </Link>
        <Link
          href="/settings/team"
          onClick={close}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          Équipe
        </Link>
      </div>
    </SheetContent>
  );
}
