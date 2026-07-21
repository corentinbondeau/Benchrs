"use client";

import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  BarChart3,
  ClipboardCheck,
  MessageSquare,
  Heart,
  Car,
  ListTodo,
  Swords,
  Image,
  Trophy,
  Bell,
  Settings,
  Medal,
  Shield,
  UserCog,
  Wallet,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: Calendar },
  { href: "/roster", label: "Effectif", icon: Users },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/attendance", label: "Présences", icon: ClipboardCheck },
  { href: "/convocations", label: "Convocations", icon: Users },
  { href: "/chat", label: "Messagerie", icon: MessageSquare },
  { href: "/medical", label: "Infirmerie", icon: Heart },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/tasks", label: "Tâches", icon: ListTodo },
  { href: "/tactics", label: "Tactique", icon: Swords },
  { href: "/gallery", label: "Galerie", icon: Image },
  { href: "/trophies", label: "Trophées", icon: Trophy },
  { href: "/championship", label: "Championnat", icon: Medal },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const coachItems = [
  { href: "/admin/players", label: "Gestion joueurs", icon: UserCog },
  { href: "/admin/cotisations", label: "Cotisations", icon: Wallet },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[var(--color-navy)] text-white">
      <div className="flex h-14 items-center gap-2 px-4 border-b border-white/10">
        <Shield className="h-6 w-6 text-[var(--color-gold)]" />
        <span className="text-lg font-bold">SportPlus</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
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

        {isCoach && (
          <>
            <div className="my-3 border-t border-white/10" />
            <p className="px-3 py-1 text-xs font-semibold text-white/40 uppercase tracking-wider">
              Admin
            </p>
            {coachItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
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
          </>
        )}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          Paramètres
        </Link>
      </div>
    </aside>
  );
}
