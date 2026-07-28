"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSheet } from "@/lib/sheet-context";
import {
  LayoutDashboard,
  Calendar,
  Users,
  MessageSquare,
  Menu,
} from "lucide-react";

const items = [
  { href: "/", label: "Accueil", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: Calendar },
  { href: "/roster", label: "Effectif", icon: Users },
  { href: "/chat", label: "Messagerie", icon: MessageSquare },
];

export function BottomNav() {
  const pathname = usePathname();
  const { setOpen } = useSheet();

  return (
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
      <button
        onClick={() => setOpen(true)}
        className="relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-white/40 transition-colors"
      >
        <Menu className="h-6 w-6" />
        Menu
      </button>
    </nav>
  );
}
