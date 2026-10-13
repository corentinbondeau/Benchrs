"use client";

import { FriendlyMatchesPanel } from "@/components/friendly/FriendlyMatchesPanel";
import { useTeam } from "@/lib/team";

export default function FriendlyMatchesPage() {
  return (
    <div className="section-gap">
      <FriendlyMatchesPanel />
    </div>
  );
}
