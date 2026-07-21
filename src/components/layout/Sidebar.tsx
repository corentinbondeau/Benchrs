"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CalendarCheck,
  CalendarDays,
  BarChart3,
  Swords,
  MessageCircle,
  Car,
  HeartPulse,
  Trophy,
  Bell,
  Settings,
  LogOut,
  Users,
  ClipboardList,
  Clock,
  Image,
  Shield,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const coachLinks = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/schedule", label: "Planning", icon: Clock },
  { href: "/attendance", label: "Présences", icon: CalendarCheck },
  { href: "/roster", label: "Effectif", icon: Users },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/tactics", label: "Tactique & Séances", icon: Swords },
  { href: "/tasks", label: "Tâches", icon: ClipboardList },
  { href: "/chat", label: "Messages", icon: MessageCircle },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/medical", label: "Infirmerie", icon: HeartPulse },
  { href: "/gallery", label: "Galerie", icon: Image },
  { href: "/trophies", label: "Trophées", icon: Trophy },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/players", label: "Gestion joueurs", icon: Shield },
  { href: "/admin/cotisations", label: "Cotisations", icon: ClipboardList },
];

const playerLinks = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/schedule", label: "Planning", icon: Clock },
  { href: "/attendance", label: "Présences", icon: CalendarCheck },
  { href: "/roster", label: "Effectif", icon: Users },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/stats/my", label: "Mes Stats", icon: BarChart3 },
  { href: "/chat", label: "Messages", icon: MessageCircle },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/medical", label: "Infirmerie", icon: HeartPulse },
  { href: "/gallery", label: "Galerie", icon: Image },
  { href: "/trophies", label: "Trophées", icon: Trophy },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const parentLinks = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/schedule", label: "Planning", icon: Clock },
  { href: "/attendance", label: "Présences", icon: CalendarCheck },
  { href: "/chat", label: "Messages", icon: MessageCircle },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/tasks", label: "Tâches", icon: ClipboardList },
  { href: "/gallery", label: "Galerie", icon: Image },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;

  const links =
    role === "coach"
      ? coachLinks
      : role === "player"
      ? playerLinks
      : parentLinks;

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:bg-sidebar lg:text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--gold)] text-[var(--gold-foreground)] font-bold text-sm">
          SP
        </div>
        <span className="text-lg font-bold tracking-tight">SportPlus</span>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {links.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      <div className="p-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/settings"
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Paramètres
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Déconnexion
        </Button>
      </div>
    </aside>
  );
}
