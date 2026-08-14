"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  Euro,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Receipt,
  Plus,
  BellRing,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile, Cotisation, TreasuryTransaction } from "@/types";
import { currentSeasonLabel } from "@/lib/goals";

const TRX_CATEGORIES = [
  "Cotisation",
  "Licence",
  "Équipement",
  "Maillots",
  "Transport",
  "Arbitrage",
  "Fournitures",
  "Autre",
];

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  paid: { label: "Payé", variant: "default" },
  partial: { label: "Partiel", variant: "secondary" },
  pending: { label: "En attente", variant: "destructive" },
};

export default function TreasuryPage() {
  const { currentTeam, userRole } = useTeam();
  const { user } = useAuth();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [cotisations, setCotisations] = useState<Cotisation[]>([]);
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(currentSeasonLabel());

  const [relancing, setRelancing] = useState<string | null>(null);

  const [txOpen, setTxOpen] = useState(false);
  const [txType, setTxType] = useState<"income" | "expense">("income");
  const [txLabel, setTxLabel] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("Cotisation");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txNotes, setTxNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentTeam) return null;
    const supabase = createClient();
    const [membersRes, cotisRes, txRes] = await Promise.all([
      supabase.from("team_members").select("user_id").eq("team_id", currentTeam.id).in("role", ["player"]),
      supabase.from("cotisations").select("*").eq("team_id", currentTeam.id).eq("season", season),
      supabase.from("treasury_transactions").select("*").eq("team_id", currentTeam.id).order("txn_date", { ascending: false }),
    ]);
    let profiles: Profile[] = [];
    const memberIds = (membersRes.data || []).map((m) => m.user_id);
    if (memberIds.length > 0) {
      const { data: p } = await supabase.from("profiles").select("*").in("id", memberIds).order("last_name", { ascending: true });
      profiles = (p as Profile[]) || [];
    }
    return {
      players: profiles,
      cotisations: (cotisRes.data as Cotisation[]) || [],
      transactions: (txRes.data as TreasuryTransaction[]) || [],
    };
  }, [currentTeam?.id, season]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (!cancelled && res) {
        setPlayers(res.players);
        setCotisations(res.cotisations);
        setTransactions(res.transactions);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const cotisationMap = new Map<string, Cotisation>();
  for (const c of cotisations) cotisationMap.set(c.player_id, c);

  const totalExpected = cotisations.reduce((s, c) => s + Number(c.amount_expected), 0);
  const totalPaid = cotisations.reduce((s, c) => s + Number(c.amount_paid), 0);
  const incomeTx = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expenseTx = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const balance = totalPaid + incomeTx - expenseTx;

  function resetTxForm() {
    setTxType("income");
    setTxLabel("");
    setTxAmount("");
    setTxCategory("Cotisation");
    setTxDate(new Date().toISOString().slice(0, 10));
    setTxNotes("");
  }

  async function handleSaveTx() {
    if (!currentTeam || !user) return;
    const amount = parseFloat(txAmount);
    if (!txLabel.trim() || isNaN(amount) || amount <= 0) {
      toast.error("Libellé et montant invalides");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("treasury_transactions").insert({
      team_id: currentTeam.id,
      type: txType,
      label: txLabel.trim(),
      amount,
      category: txCategory,
      txn_date: txDate || new Date().toISOString().slice(0, 10),
      recorded_by: user.id,
      notes: txNotes.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
      return;
    }
    toast.success(txType === "income" ? "Recette enregistrée" : "Dépense enregistrée");
    setTxOpen(false);
    resetTxForm();
    const res = await loadData();
    if (res) {
      setTransactions(res.transactions);
    }
  }

  async function handleRelance(c: Cotisation) {
    if (!currentTeam) return;
    setRelancing(c.id);
    try {
      const res = await authFetch("/api/treasury/relance", {
        method: "POST",
        body: JSON.stringify({ teamId: currentTeam.id, cotisationId: c.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      toast.success(`Relance envoyée à ${json.sent} destinataire(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la relance");
    } finally {
      setRelancing(null);
    }
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  const isCoach = userRole === "coach" || userRole === "owner";
  if (!isCoach) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Accès réservé au coach</p>
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[var(--color-royal)]" />
            Trésorerie
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cotisations, dépenses, recettes et relances automatiques
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Saison</Label>
          <Input value={season} onChange={(e) => setSeason(e.target.value)} className="w-32" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Euro className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Solde global</p>
              <p className="text-lg font-bold">{balance.toFixed(2)} €</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recettes</p>
              <p className="text-lg font-bold">{(totalPaid + incomeTx).toFixed(2)} €</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-700">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dépenses</p>
              <p className="text-lg font-bold">{expenseTx.toFixed(2)} €</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <PiggyBank className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Restant dû</p>
              <p className="text-lg font-bold">{(totalExpected - totalPaid).toFixed(2)} €</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Solde par famille — Saison {season}
              </CardTitle>
              <Button
                size="sm"
                className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
                onClick={() => {
                  resetTxForm();
                  setTxOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Ajouter
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Joueur</TableHead>
                    <TableHead className="text-right">Attendu</TableHead>
                    <TableHead className="text-right">Payé</TableHead>
                    <TableHead className="text-right">Solde</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Aucun joueur dans l&apos;équipe
                      </TableCell>
                    </TableRow>
                  )}
                  {players.map((player) => {
                    const c = cotisationMap.get(player.id);
                    const remaining = c ? Math.max(0, Number(c.amount_expected) - Number(c.amount_paid)) : 0;
                    const cfg = c ? statusConfig[c.status] : null;
                    return (
                      <TableRow key={player.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold">
                              {player.first_name[0]}{player.last_name[0]}
                            </div>
                            <p className="font-medium text-sm">
                              {player.first_name} {player.last_name}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{c ? `${Number(c.amount_expected).toFixed(2)} €` : "—"}</TableCell>
                        <TableCell className="text-right">{c ? `${Number(c.amount_paid).toFixed(2)} €` : "—"}</TableCell>
                        <TableCell className={`text-right font-semibold ${remaining > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {remaining > 0 ? `-${remaining.toFixed(2)} €` : "0.00 €"}
                        </TableCell>
                        <TableCell>
                          {c?.due_date ? (
                            <span
                              className={
                                new Date(c.due_date) < new Date()
                                  ? "text-red-600 font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              {new Date(c.due_date).toLocaleDateString("fr-FR")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{cfg ? <Badge variant={cfg.variant}>{cfg.label}</Badge> : <span className="text-xs text-muted-foreground">Aucune</span>}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={!c || remaining <= 0 || relancing === c?.id}
                            onClick={() => c && handleRelance(c)}
                          >
                            {relancing === c?.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <BellRing className="h-3 w-3 mr-1" />
                            )}
                            Relancer
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PiggyBank className="h-4 w-4" />
                Dépenses &amp; recettes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Aucune opération enregistrée
                      </TableCell>
                    </TableRow>
                  )}
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(t.txn_date + "T00:00:00").toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{t.label}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t.category}</Badge>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${t.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
                        {t.type === "income" ? "+" : "-"}
                        {Number(t.amount).toFixed(2)} €
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{txType === "income" ? "Ajouter une recette" : "Ajouter une dépense"}</DialogTitle>
            <DialogDescription>Suivi de la trésorerie de l&apos;équipe</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={txType === "income" ? "default" : "outline"}
                onClick={() => setTxType("income")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Recette
              </Button>
              <Button
                variant={txType === "expense" ? "default" : "outline"}
                onClick={() => setTxType("expense")}
                className="bg-red-600 hover:bg-red-700"
              >
                Dépense
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Libellé *</Label>
              <Input value={txLabel} onChange={(e) => setTxLabel(e.target.value)} placeholder="Ex. Achat de 10 ballons" />
            </div>
            <div className="space-y-2">
              <Label>Montant (€) *</Label>
              <Input type="number" step="0.01" min="0" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} placeholder="50.00" />
            </div>
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select value={txCategory} onValueChange={(v) => setTxCategory(v ?? "Autre")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRX_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes (optionnel)</Label>
              <Textarea value={txNotes} onChange={(e) => setTxNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxOpen(false)}>Annuler</Button>
            <Button
              className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
              disabled={!txLabel.trim() || !txAmount || saving}
              onClick={handleSaveTx}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
