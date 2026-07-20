"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  CalendarCheck,
  BarChart3,
  Swords,
  MessageCircle,
  Car,
  HeartPulse,
  Trophy,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";

const coachLinks = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/attendance", label: "Présences", icon: CalendarCheck },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/tactics", label: "Tactique & Séances", icon: Swords },
  { href: "/chat", label: "Messages", icon: MessageCircle },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/medical", label: "Infirmerie", icon: HeartPulse },
  { href: "/trophies", label: "Trophées", icon: Trophy },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const playerLinks = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/attendance", label: "Présences", icon: CalendarCheck },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/chat", label: "Messages", icon: MessageCircle },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/medical", label: "Infirmerie", icon: HeartPulse },
  { href: "/trophies", label: "Trophées", icon: Trophy },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const parentLinks = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/attendance", label: "Présences", icon: CalendarCheck },
  { href: "/chat", label: "Messages", icon: MessageCircle },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" />}>
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground">
        <div className="flex h-16 items-center justify-between px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--gold)] text-[var(--gold-foreground)] font-bold text-sm">
              SP
            </div>
            <span className="text-lg font-bold">SportPlus</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            className="text-sidebar-foreground"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {links.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
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

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-sidebar-border">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
          >
            <Settings className="h-4 w-4" />
            Paramètres
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/70"
            onClick={() => {
              setOpen(false);
              signOut({ callbackUrl: "/login" });
            }}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
