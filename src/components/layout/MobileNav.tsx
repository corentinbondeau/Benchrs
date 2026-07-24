"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Calendar,
  Users,
  BarChart3,
  MessageSquare,
  Heart,
  Car,
  ListTodo,
  Swords,
  Image,
  Trophy,
  Bell,
  Settings,
  Shield,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: Calendar },
  { href: "/roster", label: "Effectif", icon: Users },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/convocations", label: "Convocations", icon: Users },
  { href: "/chat", label: "Messagerie", icon: MessageSquare },
  { href: "/medical", label: "Infirmerie", icon: Heart },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/tasks", label: "Tâches", icon: ListTodo },
  { href: "/tactics", label: "Tactique", icon: Swords, coachOnly: true },
  { href: "/gallery", label: "Galerie", icon: Image },
  { href: "/trophies", label: "Trophées", icon: Trophy },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentTeam, teams, switchTeam } = useTeam();
  const isCoach = user?.profile?.role === "coach";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="lg:hidden">
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-[var(--color-navy)]">
        <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="SportPlus" className="h-6 w-6" />
            <span className="text-lg font-bold text-white">SportPlus</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Team selector */}
        {currentTeam && (
          <div className="px-3 py-2 border-b border-white/10">
            {teams.length > 1 ? (
              <select
                value={currentTeam.id}
                onChange={(e) => {
                  switchTeam(e.target.value);
                  setOpen(false);
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
                onClick={() => setOpen(false)}
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
      </SheetContent>
    </Sheet>
  );
}
