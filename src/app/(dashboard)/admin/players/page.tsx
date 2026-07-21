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
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { Profile } from "@/types";

export default function AdminPlayersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Profile | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);

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

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/export");
      if (!res.ok) throw new Error("Erreur lors de l'export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `effectif_sportplus_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Erreur lors de l'export CSV");
    } finally {
      setExporting(false);
    }
  }

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Gestion des joueurs</h2>
            <p className="text-muted-foreground mt-1">
              Ajouter, modifier et gérer les membres de l&apos;équipe
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="h-4 w-4 mr-1" />
            {exporting ? "Export..." : "Exporter CSV"}
          </Button>
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
