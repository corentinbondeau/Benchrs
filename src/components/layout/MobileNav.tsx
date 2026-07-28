"use client";

import { SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

export function MobileNav() {
  return (
    <SheetTrigger className="lg:hidden">
      <Menu className="h-5 w-5" />
    </SheetTrigger>
  );
}
