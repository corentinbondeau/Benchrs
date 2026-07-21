"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Wallet,
  FileCheck,
  AlertTriangle,
  Check,
  Plus,
  Download,
  Euro,
} from "lucide-react";
import type { Profile, Licence, Cotisation, PaymentHistory } from "@/types";

interface PlayerFinance {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  licence: Licence | null;
  cotisation: Cotisation | null;
}

const licenceStatusLabels: Record<string, string> = {
  valid: "Valide",
  pending_documents: "En attente",
  expired: "Périmé",
};

const licenceStatusColors: Record<string, string> = {
  valid: "bg-green-100 text-green-700",
  pending_documents: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-700",
};

const paymentStatusLabels: Record<string, string> = {
  paid: "Réglé",
  pending: "En attente",
  partial: "Partiel",
};

const paymentStatusColors: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-700",
};

export function CotisationsManagement() {
  const { data: session } = useSession();
  const [players, setPlayers] = useState<PlayerFinance[]>([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState("2025-2026");
  const [editingPlayer, setEditingPlayer] = useState<PlayerFinance | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("espèces");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Edit cotisation form
  const [editForm, setEditForm] = useState({
    amount_expected: "",
    amount_paid: "",
    status: "pending" as "paid" | "pending" | "partial",
    licence_status: "pending_documents" as "valid" | "pending_documents" | "expired",
    notes: "",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/cotisations?season=${season}`);
      if (res.ok && !cancelled) {
        const data = await res.json();
        setPlayers(data);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [season, refreshKey]);

  function handleEdit(player: PlayerFinance) {
    setEditingPlayer(player);
    setEditForm({
      amount_expected: player.cotisation?.amount_expected?.toString() || "150",
      amount_paid: player.cotisation?.amount_paid?.toString() || "0",
      status: (player.cotisation?.status as "paid" | "pending" | "partial") || "pending",
      licence_status: (player.licence?.status as "valid" | "pending_documents" | "expired") || "pending_documents",
      notes: player.cotisation?.notes || "",
    });
  }

  async function saveCotisation() {
    if (!editingPlayer) return;
    await fetch("/api/cotisations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: editingPlayer.id,
        season,
        amount_expected: parseFloat(editForm.amount_expected) || 0,
        amount_paid: parseFloat(editForm.amount_paid) || 0,
        status: editForm.status,
        notes: editForm.notes || null,
      }),
    });

    // Also update licence
    const supabase = createClient();
    await supabase.from("licences").upsert({
      player_id: editingPlayer.id,
      season,
      status: editForm.licence_status,
      updated_at: new Date().toISOString(),
    }, { onConflict: "player_id,season" });

    setEditingPlayer(null);
    setRefreshKey((k) => k + 1);
  }

  async function recordPayment() {
    if (!editingPlayer || !paymentAmount || parseFloat(paymentAmount) <= 0) return;
    await fetch("/api/cotisations/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cotisation_id: editingPlayer.cotisation?.id,
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        notes: paymentNotes || null,
      }),
    });
    setShowPaymentDialog(false);
    setPaymentAmount("");
    setPaymentNotes("");
    setEditingPlayer(null);
    setRefreshKey((k) => k + 1);
  }

  const totalExpected = players.reduce((sum, p) => sum + (p.cotisation?.amount_expected || 0), 0);
  const totalPaid = players.reduce((sum, p) => sum + (p.cotisation?.amount_paid || 0), 0);
  const validLicences = players.filter((p) => p.licence?.status === "valid").length;
  const pendingPayments = players.filter((p) => p.cotisation?.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--gold)]/10">
                <Euro className="h-5 w-5 text-[var(--gold)]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total attendu</p>
                <p className="text-lg font-bold">{totalExpected.toFixed(0)}€</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <Wallet className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total perçu</p>
                <p className="text-lg font-bold">{totalPaid.toFixed(0)}€</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <FileCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Licences valides</p>
                <p className="text-lg font-bold">{validLicences}/{players.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">En attente</p>
                <p className="text-lg font-bold">{pendingPayments}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Players table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Suivi des cotisations & licences</CardTitle>
            <div className="flex gap-2">
              <select
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              >
                <option value="2025-2026">2025-2026</option>
                <option value="2024-2025">2024-2025</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joueur</TableHead>
                  <TableHead>Licence</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Payé</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucun joueur dans l&apos;effectif
                    </TableCell>
                  </TableRow>
                ) : (
                  players.map((player) => (
                    <TableRow key={player.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--royal)]/10 text-[var(--royal)] text-xs font-bold shrink-0">
                            {player.shirt_number || "?"}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {player.first_name} {player.last_name}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={licenceStatusColors[player.licence?.status || "pending_documents"]}>
                          {licenceStatusLabels[player.licence?.status || "pending_documents"]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {player.cotisation?.amount_expected || 0}€
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {player.cotisation?.amount_paid || 0}€
                      </TableCell>
                      <TableCell>
                        <Badge className={paymentStatusColors[player.cotisation?.status || "pending"]}>
                          {paymentStatusLabels[player.cotisation?.status || "pending"]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(player)}
                          >
                            Gérer
                          </Button>
                          {player.cotisation?.status !== "paid" && (
                            <Button
                              size="sm"
                              className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
                              onClick={() => {
                                setEditingPlayer(player);
                                setShowPaymentDialog(true);
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Paiement
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editingPlayer && !showPaymentDialog} onOpenChange={(open) => { if (!open) setEditingPlayer(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingPlayer?.first_name} {editingPlayer?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Licence</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editForm.licence_status}
                onChange={(e) => setEditForm({ ...editForm, licence_status: e.target.value as typeof editForm.licence_status })}
              >
                <option value="valid">Valide</option>
                <option value="pending_documents">En attente de pièces</option>
                <option value="expired">Périmée</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Montant attendu (€)</Label>
                <Input
                  type="number"
                  value={editForm.amount_expected}
                  onChange={(e) => setEditForm({ ...editForm, amount_expected: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Montant payé (€)</Label>
                <Input
                  type="number"
                  value={editForm.amount_paid}
                  onChange={(e) => setEditForm({ ...editForm, amount_paid: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Statut paiement</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as typeof editForm.status })}
              >
                <option value="paid">Réglé</option>
                <option value="pending">En attente</option>
                <option value="partial">Partiel</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2}
              />
            </div>
            <Button onClick={saveCotisation} className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90">
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {editingPlayer?.first_name} {editingPlayer?.last_name}
            </p>
            <div className="space-y-2">
              <Label>Montant (€)</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Mode de paiement</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="espèces">Espèces</option>
                <option value="chèque">Chèque</option>
                <option value="virement">Virement</option>
                <option value="CB">CB</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optionnel"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={recordPayment} disabled={!paymentAmount || parseFloat(paymentAmount) <= 0} className="flex-1 bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90">
                <Check className="h-4 w-4 mr-1" />
                Valider
              </Button>
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
