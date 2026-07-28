"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Plus,
  History,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Receipt,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { Profile, Cotisation, PaymentHistory } from "@/types";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const CURRENT_SEASON = "2025-2026";

const PAYMENT_METHODS = [
  "Espèces",
  "Chèque",
  "Virement",
  "Carte bancaire",
  "Prélèvement",
];

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  paid: { label: "Payé", variant: "default" },
  partial: { label: "Partiel", variant: "secondary" },
  pending: { label: "En attente", variant: "destructive" },
};

export default function CotisationsPage() {
  const { currentTeam } = useTeam();
  const { user } = useAuth();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [cotisations, setCotisations] = useState<Cotisation[]>([]);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(CURRENT_SEASON);

  const [defineOpen, setDefineOpen] = useState(false);
  const [definePlayer, setDefinePlayer] = useState<Profile | null>(null);
  const [defineAmount, setDefineAmount] = useState("");

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentCotisation, setPaymentCotisation] = useState<Cotisation | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCotisation, setHistoryCotisation] = useState<Cotisation | null>(null);
  const [historyPayments, setHistoryPayments] = useState<PaymentHistory[]>([]);
  const [historyPlayer, setHistoryPlayer] = useState<Profile | null>(null);

  const [saving, setSaving] = useState(false);

  const [cardOpen, setCardOpen] = useState(false);
  const [cardCotisation, setCardCotisation] = useState<Cotisation | null>(null);
  const [cardPlayer, setCardPlayer] = useState<Profile | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState("");

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    if (!currentTeam) return;

    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", currentTeam.id);

    let profiles: Profile[] = [];
    if (members && members.length > 0) {
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .in("id", members.map((m) => m.user_id))
        .order("last_name", { ascending: true });
      profiles = (p as Profile[]) || [];
    }
    setPlayers(profiles);

    const { data: c } = await supabase
      .from("cotisations")
      .select("*")
      .eq("team_id", currentTeam.id)
      .eq("season", season);
    setCotisations((c as Cotisation[]) || []);
    setLoading(false);
  }, [currentTeam?.id, season, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cotisationMap = new Map<string, Cotisation>();
  for (const c of cotisations) {
    cotisationMap.set(c.player_id, c);
  }

  const sortedPlayers = [...players].sort((a, b) =>
    (a.last_name ?? "").localeCompare(b.last_name ?? "")
  );

  const stats = {
    totalExpected: cotisations.reduce((s, c) => s + Number(c.amount_expected), 0),
    totalPaid: cotisations.reduce((s, c) => s + Number(c.amount_paid), 0),
    paidCount: cotisations.filter((c) => c.status === "paid").length,
    pendingCount: cotisations.filter((c) => c.status !== "paid").length,
  };

  async function handleDefine() {
    if (!definePlayer || !defineAmount || !currentTeam) return;
    setSaving(true);
    const amount = parseFloat(defineAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Montant invalide");
      setSaving(false);
      return;
    }

    const existing = cotisationMap.get(definePlayer.id);
    if (existing) {
      const { error } = await supabase
        .from("cotisations")
        .update({ amount_expected: amount, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Montant mis à jour");
      }
    } else {
      const { error } = await supabase.from("cotisations").insert({
        player_id: definePlayer.id,
        season,
        amount_expected: amount,
        amount_paid: 0,
        status: "pending",
        team_id: currentTeam.id,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Cotisation créée");
      }
    }

    setSaving(false);
    setDefineOpen(false);
    setDefinePlayer(null);
    setDefineAmount("");
    fetchData();
  }

  async function handlePayment() {
    if (!paymentCotisation || !paymentAmount || !currentTeam || !user) return;
    setSaving(true);
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Montant invalide");
      setSaving(false);
      return;
    }

    const newPaid = Number(paymentCotisation.amount_paid) + amount;
    const expected = Number(paymentCotisation.amount_expected);
    const newStatus = newPaid >= expected ? "paid" : newPaid > 0 ? "partial" : "pending";

    const { error: payErr } = await supabase.from("payment_history").insert({
      cotisation_id: paymentCotisation.id,
      amount,
      payment_method: paymentMethod || null,
      payment_date: paymentDate || null,
      recorded_by: user.id,
      notes: paymentNotes || null,
      team_id: currentTeam.id,
    });
    if (payErr) {
      toast.error(payErr.message);
      setSaving(false);
      return;
    }

    const { error: updErr } = await supabase
      .from("cotisations")
      .update({
        amount_paid: newPaid,
        status: newStatus,
        payment_method: paymentMethod || null,
        payment_date: paymentDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentCotisation.id);

    if (updErr) {
      toast.error(updErr.message);
    } else {
      toast.success("Paiement enregistré");
    }

    setSaving(false);
    setPaymentOpen(false);
    setPaymentCotisation(null);
    setPaymentAmount("");
    setPaymentMethod("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentNotes("");
    fetchData();
  }

  async function openHistory(c: Cotisation, player: Profile) {
    setHistoryCotisation(c);
    setHistoryPlayer(player);
    const { data } = await supabase
      .from("payment_history")
      .select("*")
      .eq("cotisation_id", c.id)
      .order("created_at", { ascending: false });
    setHistoryPayments((data as PaymentHistory[]) || []);
    setHistoryOpen(true);
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Cotisations</h2>
          <p className="text-muted-foreground mt-1">Suivi des paiements</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Saison</Label>
          <Input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-32"
          />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Euro className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Attendu</p>
              <p className="text-lg font-bold">{stats.totalExpected.toFixed(2)} €</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Collecté</p>
              <p className="text-lg font-bold">{stats.totalPaid.toFixed(2)} €</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Restant dû</p>
              <p className="text-lg font-bold">
                {(stats.totalExpected - stats.totalPaid).toFixed(2)} €
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <PiggyBank className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Statut</p>
              <p className="text-lg font-bold">
                {stats.paidCount}/{cotisations.length} payé
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Joueurs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joueur</TableHead>
                  <TableHead className="text-right">Attendu</TableHead>
                  <TableHead className="text-right">Payé</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPlayers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Aucun joueur dans l&apos;équipe
                    </TableCell>
                  </TableRow>
                )}
                {sortedPlayers.map((player) => {
                  const c = cotisationMap.get(player.id);
                  const cfg = c ? statusConfig[c.status] : null;
                  return (
                    <TableRow key={player.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold">
                            {player.first_name[0]}{player.last_name[0]}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {player.first_name} {player.last_name}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {c ? `${Number(c.amount_expected).toFixed(2)} €` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {c ? `${Number(c.amount_paid).toFixed(2)} €` : "—"}
                      </TableCell>
                      <TableCell>
                        {cfg ? (
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Aucune</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!c && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => {
                                setDefinePlayer(player);
                                setDefineAmount("");
                                setDefineOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Définir
                            </Button>
                          )}
                          {c && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => {
                                  setDefinePlayer(player);
                                  setDefineAmount(String(Number(c.amount_expected)));
                                  setDefineOpen(true);
                                }}
                              >
                                <Euro className="h-3 w-3 mr-1" />
                                Modifier
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
                                onClick={() => {
                                  setPaymentCotisation(c);
                                  setPaymentAmount("");
                                  setPaymentMethod("");
                                  setPaymentDate(new Date().toISOString().slice(0, 10));
                                  setPaymentNotes("");
                                  setPaymentOpen(true);
                                }}
                              >
                                <Receipt className="h-3 w-3 mr-1" />
                                Encaisser
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={async () => {
                                  setCardLoading(true);
                                  setCardCotisation(c);
                                  setCardPlayer(player);
                                  const res = await fetch("/api/stripe/create-payment-intent", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      cotisation_id: c.id,
                                      amount: Number(c.amount_expected) - Number(c.amount_paid),
                                      player_name: `${player.first_name} ${player.last_name}`,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) {
                                    toast.error(data.error || "Erreur de paiement");
                                    setCardLoading(false);
                                    setCardCotisation(null);
                                    setCardPlayer(null);
                                  } else {
                                    setClientSecret(data.clientSecret);
                                    setCardLoading(false);
                                    setCardOpen(true);
                                  }
                                }}
                              >
                                <CreditCard className="h-3 w-3 mr-1" />
                                Carte
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => openHistory(c, player)}
                              >
                                <History className="h-3 w-3 mr-1" />
                                Hist.
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Define / Edit dialog */}
      <Dialog open={defineOpen} onOpenChange={setDefineOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {cotisationMap.has(definePlayer?.id ?? "")
                ? "Modifier le montant"
                : "Définir la cotisation"}
            </DialogTitle>
            <DialogDescription>
              {definePlayer?.first_name} {definePlayer?.last_name} — Saison {season}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Montant attendu (€)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={defineAmount}
                onChange={(e) => setDefineAmount(e.target.value)}
                placeholder="50.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefineOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              disabled={!defineAmount || saving}
              onClick={handleDefine}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
            <DialogDescription>
              Restant dû :{" "}
              {paymentCotisation
                ? (Number(paymentCotisation.amount_expected) - Number(paymentCotisation.amount_paid)).toFixed(2)
                : "0.00"}{" "}
              €
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Montant *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="50.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Moyen de paiement</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optionnel)</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Chèque n°..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              disabled={!paymentAmount || saving}
              onClick={handlePayment}
            >
              {saving ? "Enregistrement..." : "Enregistrer le paiement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card payment dialog */}
      {cardOpen && cardCotisation && clientSecret && stripePromise && (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
          <CardPaymentDialog
            cotisation={cardCotisation}
            player={cardPlayer}
            onClose={() => {
              setCardOpen(false);
              setCardCotisation(null);
              setCardPlayer(null);
              setClientSecret("");
            }}
            onSuccess={() => {
              setCardOpen(false);
              setCardCotisation(null);
              setCardPlayer(null);
              setClientSecret("");
              fetchData();
            }}
          />
        </Elements>
      )}
      {cardLoading && (
        <Dialog open onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Préparation du paiement...</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-[var(--color-gold)]" />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Payment history dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Historique des paiements</DialogTitle>
            <DialogDescription>
              {historyPlayer?.first_name} {historyPlayer?.last_name}
              {historyCotisation
                ? ` — ${Number(historyCotisation.amount_paid).toFixed(2)} / ${Number(historyCotisation.amount_expected).toFixed(2)} €`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {historyPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucun paiement enregistré
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {historyPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-semibold text-sm">
                      +{Number(p.amount).toFixed(2)} €
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_method || "Moyen non spécifié"}
                      {p.payment_date ? ` — ${new Date(p.payment_date).toLocaleDateString("fr-FR")}` : ""}
                    </p>
                    {p.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardPaymentDialog({
  cotisation,
  player,
  onClose,
  onSuccess,
}: {
  cotisation: Cotisation;
  player: Profile | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(
    (Number(cotisation.amount_expected) - Number(cotisation.amount_paid)).toFixed(2)
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError("");

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message || "Paiement refusé");
      setProcessing(false);
    } else {
      toast.success("Paiement accepté !");
      onSuccess();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Paiement par carte</DialogTitle>
          <DialogDescription>
            {player?.first_name} {player?.last_name}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Montant à payer (€)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={Number(cotisation.amount_expected) - Number(cotisation.amount_paid)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="rounded-lg border p-4">
            <PaymentElement />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={processing}>
              Annuler
            </Button>
            <Button
              type="submit"
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              disabled={!stripe || processing}
            >
              {processing ? "Paiement en cours..." : `Payer ${amount} €`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
