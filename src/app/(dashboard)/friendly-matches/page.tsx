"use client";

import { FriendlyMatchesPanel } from "@/components/friendly/FriendlyMatchesPanel";

export default function FriendlyMatchesPage() {
  return (
    <div className="section-gap">
      <div>
        <h1 className="text-2xl font-bold">Matchs amicaux</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Publiez un créneau et trouvez un adversaire pour votre équipe.
        </p>
      </div>
      <FriendlyMatchesPanel />
    </div>
  );
}
