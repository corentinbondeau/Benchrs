"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
  Shield,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: Calendar },
  { href: "/roster", label: "Effectif", icon: Users },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/attendance", label: "Presences", icon: ClipboardCheck },
  { href: "/chat", label: "Messagerie", icon: MessageSquare },
  { href: "/medical", label: "Infirmerie", icon: Heart },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/tasks", label: "Taches", icon: ListTodo },
  { href: "/tactics", label: "Tactique", icon: Swords },
  { href: "/gallery", label: "Galerie", icon: Image },
  { href: "/trophies", label: "Trophees", icon: Trophy },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="lg:hidden">
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-[var(--color-navy)]">
        <div className="flex h-14 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-[var(--color-gold)]" />
            <span className="text-lg font-bold text-white">SportPlus</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
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
