"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Sheet, SheetContent, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { X, Menu as MenuIcon } from "lucide-react";
import {
  LayoutDashboard,
  Calendar,
  Users,
  MessageSquare,
  BarChart3,
  Heart,
  Car,
  ListTodo,
  Swords,
  Image,
  Trophy,
  Bell,
  Settings,
  Settings2,
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

function SheetContentInner({ close }: { close: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentTeam, teams, switchTeam } = useTeam();
  const isCoach = user?.profile?.role === "coach";

  return (
    <SheetContent side="left" className="w-64 p-0 bg-[var(--color-navy)]" showCloseButton={false}>
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
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          {teams.length > 1 ? (
            <>
              <select
                value={currentTeam.id}
                onChange={(e) => {
                  switchTeam(e.target.value);
                  close();
                }}
                className="flex-1 bg-white/10 text-white text-sm rounded-lg px-3 py-2 appearance-none cursor-pointer hover:bg-white/15 transition-colors"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id} className="bg-[var(--color-navy)]">
                    {team.club?.name ? `${team.club.name} — ` : ""}{team.name}
                  </option>
                ))}
              </select>
              <Link href="/settings/team" onClick={close} className="text-white/40 hover:text-white shrink-0">
                <Settings2 className="h-5 w-5" />
              </Link>
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{currentTeam.club?.name || currentTeam.name}</p>
                {currentTeam.club && (
                  <p className="text-xs text-white/50 truncate">{currentTeam.name}</p>
                )}
              </div>
              <Link href="/settings/team" onClick={close} className="text-white/40 hover:text-white shrink-0">
                <Settings2 className="h-5 w-5" />
              </Link>
            </>
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

      <div className="border-t border-white/10 p-3">
        <Link
          href="/settings"
          onClick={close}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          Mon profil
        </Link>
      </div>
    </SheetContent>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const close = useCallback(() => {
    const closeBtn = document.querySelector<HTMLButtonElement>('[data-bottom-sheet-close]');
    closeBtn?.click();
  }, []);

  const items = [
    { href: "/", label: "Accueil", icon: LayoutDashboard },
    { href: "/calendar", label: "Calendrier", icon: Calendar },
    { href: "/roster", label: "Effectif", icon: Users },
    { href: "/chat", label: "Messagerie", icon: MessageSquare },
  ];

  return (
    <Sheet>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-white/10 bg-[var(--color-navy)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                active
                  ? "text-[var(--color-gold)]"
                  : "text-white/40"
              }`}
            >
              {active && (
                <span className="absolute -top-px left-1/4 right-1/4 h-0.5 rounded-full bg-[var(--color-gold)]" />
              )}
              <item.icon className="h-6 w-6" />
              {item.label}
            </Link>
          );
        })}
        <SheetTrigger
          className="relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-white/40 transition-colors"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <MenuIcon className="h-6 w-6" />
          Menu
        </SheetTrigger>
      </nav>
      <SheetClose data-bottom-sheet-close className="hidden" />
      <SheetContentInner close={close} />
    </Sheet>
  );
}
