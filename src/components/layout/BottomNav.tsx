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
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              active
                ? "text-[var(--color-gold)]"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      <button
        onClick={() => setOpen(true)}
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-white/50 hover:text-white/80 transition-colors"
      >
        <Menu className="h-5 w-5" />
        Menu
      </button>
    </nav>
  );
}
