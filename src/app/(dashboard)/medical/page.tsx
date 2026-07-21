"use client";

import { useState } from "react";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { InjuryList, InjuryForm, FitnessRatingWidget } from "@/components/medical/InjuryList";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function MedicalPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Infirmerie</h2>
          <p className="text-muted-foreground mt-1">
            Suivi des blessures et forme physique
          </p>
        </div>
        <RoleGuard allowedRoles={["coach"]}>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90" />}>
                <Plus className="h-4 w-4 mr-1" />
                Signaler
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Signaler une blessure</DialogTitle>
              </DialogHeader>
              <InjuryForm onClose={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </RoleGuard>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <InjuryList />
        </div>
        <div>
          <FitnessRatingWidget />
        </div>
      </div>
    </div>
  );
}
