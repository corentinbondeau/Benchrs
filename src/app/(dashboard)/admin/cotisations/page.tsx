"use client";

import { RoleGuard } from "@/components/layout/RoleGuard";
import { CotisationsManagement } from "@/components/admin/CotisationsManagement";

export default function AdminCotisationsPage() {
  return (
    <RoleGuard allowedRoles={["coach"]}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Cotisations & Licences</h2>
          <p className="text-muted-foreground mt-1">
            Suivi des paiements et des licences de l&apos;effectif
          </p>
        </div>
        <CotisationsManagement />
      </div>
    </RoleGuard>
  );
}
