"use client";

import { useParentChild } from "@/components/layout/ParentChildProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Baby } from "lucide-react";

export function ChildPicker() {
  const { children, selectedChild, setSelectedChildId, isParent } = useParentChild();

  if (!isParent || children.length <= 1) return null;

  return (
    <Select value={selectedChild?.id || ""} onValueChange={(v) => { if (v) setSelectedChildId(v); }}>
      <SelectTrigger className="w-[180px] h-9 text-sm">
        <Baby className="h-4 w-4 mr-2 shrink-0" />
        <SelectValue placeholder="Choisir un enfant" />
      </SelectTrigger>
      <SelectContent>
        {children.map((child) => (
          <SelectItem key={child.id} value={child.id}>
            {child.first_name} {child.last_name}
            {child.shirt_number ? ` #${child.shirt_number}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
