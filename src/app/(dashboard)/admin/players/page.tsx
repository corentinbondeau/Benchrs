"use client";

import { useState } from "react";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { PlayerTable } from "@/components/admin/PlayerTable";
import { PlayerFormDialog } from "@/components/admin/PlayerFormDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Profile } from "@/types";

export default function AdminPlayersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Profile | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleEdit(player: Profile) {
    setEditingPlayer(player);
    setDialogOpen(true);
  }

  function handleAdd() {
    setEditingPlayer(null);
    setDialogOpen(true);
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Gestion des joueurs</h2>
          <p className="text-muted-foreground mt-1">
            Ajouter, modifier et gérer les membres de l&apos;équipe
          </p>
        </div>

        <PlayerTable
          onEdit={handleEdit}
          onAdd={handleAdd}
          refreshKey={refreshKey}
        />

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingPlayer ? "Modifier le profil" : "Nouveau joueur"}
              </DialogTitle>
            </DialogHeader>
            <PlayerFormDialog
              player={editingPlayer}
              onClose={() => setDialogOpen(false)}
              onSaved={handleSaved}
            />
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
