"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, PiggyBank, Plus, Trash2, HandCoins, Send, Banknote, Lock } from "lucide-react";
import { authFetch } from "@/lib/api-client";
import { fetchTeamRecipientIds } from "@/lib/playerAlerts";
import { toast } from "sonner";
import type { TeamPot, PotContribution } from "@/types";

export default function CagnottePage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [pots, setPots] = useState<TeamPot[]>([]);
  const [contribs, setContribs] = useState<Record<string, PotContribution[]>>({});
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

  const [contribFor, setContribFor] = useState<TeamPot | null>(null);
  const [amount, setAmount] = useState("");
  const [contribName, setContribName] = useState("");
  const [message, setMessage] = useState("");
  const [method, setMethod] = useState<"cash" | "bank" | "app">("bank");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [potsRes, contribsRes] = await Promise.all([
      supabase.from("team_pots").select("*").eq("team_id", currentTeam!.id).order("created_at", { ascending: false }),
      supabase.from("pot_contributions").select("*").eq("team_id", currentTeam!.id),
    ]);
    const all = (contribsRes.data || []) as PotContribution[];
    const grouped: Record<string, PotContribution[]> = {};
    for (const c of all) {
      (grouped[c.pot_id] = grouped[c.pot_id] || []).push(c);
    }
    return { pots: (potsRes.data || []) as TeamPot[], contribs: grouped };
  }, [currentTeam]);

  useEffect(() => {
    if (!currentTeam) return;
    loadData().then((res) => {
      setPots(res.pots);
      setContribs(res.contribs);
      setLoading(false);
    });
  }, [currentTeam, loadData]);

  async function createPot() {
    if (!title.trim()) {
      toast.error("Titre requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("team_pots")
        .insert({
          team_id: currentTeam!.id,
          title: title.trim(),
          description: description.trim() || null,
          goal_amount: goal ? parseFloat(goal) : null,
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      setPots((prev) => [data as TeamPot, ...prev]);
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setGoal("");
      toast.success("Cagnotte créée");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function contribute() {
    if (!contribFor) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !contribName.trim()) {
      toast.error("Montant et nom du donateur requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pot_contributions")
        .insert({
          pot_id: contribFor.id,
          team_id: currentTeam!.id,
          contributor_id: user?.id ?? null,
          contributor_name: contribName.trim(),
          amount: amt,
          message: message.trim() || null,
          payment_method: method,
        })
        .select("*")
        .single();
      if (error) throw error;
      setContribs((prev) => ({
        ...prev,
        [contribFor.id]: [...(prev[contribFor.id] || []), data as PotContribution],
      }));
      setContribFor(null);
      setAmount("");
      setContribName("");
      setMessage("");
      toast.success("Merci pour votre contribution !");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remindPot(pot: TeamPot) {
    setBusyId(pot.id);
    try {
      const recipients = await fetchTeamRecipientIds(currentTeam!.id);
      if (recipients.length === 0) return;
      const sum = (contribs[pot.id] || []).reduce((s, c) => s + c.amount, 0);
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: recipients,
          title: `Cagnotte « ${pot.title} » 🎯`,
          body: pot.goal_amount
            ? `La cagnotte est à ${Math.round((sum / pot.goal_amount) * 100)}% de son objectif (${sum}€ / ${pot.goal_amount}€). Chaque contribution compte !`
            : `La cagnotte « ${pot.title} » a récolté ${sum}€. Chaque contribution compte !`,
          type: "cagnotte",
          reference_id: pot.id,
          team_id: currentTeam!.id,
          url: "/cagnotte",
        }),
      });
      toast.success("Relance envoyée aux familles");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function transferToTreasury(pot: TeamPot) {
    setBusyId(pot.id);
    try {
      const potContribs = contribs[pot.id] || [];
      const untransferred = potContribs.filter((c) => !c.transferred);
      const total = untransferred.reduce((s, c) => s + c.amount, 0);
      if (total <= 0) {
        toast.error("Rien à transférer");
        return;
      }
      const supabase = createClient();
      const { error: txnError } = await supabase.from("treasury_transactions").insert({
        team_id: currentTeam!.id,
        type: "income",
        label: `Cagnotte « ${pot.title} »`,
        amount: total,
        category: "cagnotte",
        recorded_by: user?.id ?? null,
        notes: `Transfert de la cagnotte (${untransferred.length} contributions)`,
      });
      if (txnError) throw txnError;
      await supabase
        .from("pot_contributions")
        .update({ transferred: true })
        .eq("pot_id", pot.id)
        .eq("transferred", false);
      setContribs((prev) => ({
        ...prev,
        [pot.id]: prev[pot.id].map((c) => ({ ...c, transferred: true })),
      }));
      toast.success(`${total}€ versés dans la trésorerie`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function deletePot(pot: TeamPot) {
    const supabase = createClient();
    const { error } = await supabase.from("team_pots").delete().eq("id", pot.id);
    if (error) {
      toast.error(String(error.message));
      return;
    }
    setPots((prev) => prev.filter((p) => p.id !== pot.id));
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-[var(--color-gold)]" />
            Cagnottes d&apos;équipe
          </h1>
          <p className="text-sm text-muted-foreground">Financement des tournois, tenues et projets. Les fonds sont versés à la trésorerie.</p>
        </div>
        {isCoach && (
          <Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouvelle cagnotte
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : pots.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Aucune cagnotte pour l&apos;instant.
          </CardContent>
        </Card>
      ) : (
        pots.map((pot) => {
          const potContribs = contribs[pot.id] || [];
          const sum = potContribs.reduce((s, c) => s + c.amount, 0);
          const pct = pot.goal_amount ? Math.min(Math.round((sum / pot.goal_amount) * 100), 100) : null;
          return (
            <Card key={pot.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {pot.title}
                      {pot.status === "closed" && (
                        <Badge className="bg-muted text-muted-foreground"><Lock className="h-3 w-3 mr-1" />Clôturée</Badge>
                      )}
                    </CardTitle>
                    {pot.description && <p className="text-sm text-muted-foreground mt-0.5">{pot.description}</p>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{sum}€ récoltés</span>
                    {pot.goal_amount && <span>Objectif {pot.goal_amount}€ ({pct}%)</span>}
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct !== null && pct >= 100 ? "bg-green-500" : "bg-[var(--color-gold)]"}`}
                      style={{ width: `${pct ?? Math.min(sum * 4, 100)}%` }}
                    />
                  </div>
                </div>

                {potContribs.length > 0 && (
                  <div className="space-y-1">
                    {potContribs.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                        <span className="flex-1 truncate">{c.contributor_name}{c.message ? <span className="text-xs text-muted-foreground"> — {c.message}</span> : null}</span>
                        <span className="font-semibold">+{c.amount}€</span>
                        <span className="text-xs text-muted-foreground capitalize">{c.payment_method}</span>
                        {c.transferred && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">versé</Badge>}
                      </div>
                    ))}
                  </div>
                )}

                {pot.status === "open" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="h-8 text-xs bg-[var(--color-royal)] hover:bg-[var(--color-royal)]/90" onClick={() => setContribFor(pot)}>
                      <HandCoins className="h-3 w-3 mr-1" />
                      Participer
                    </Button>
                    {isCoach && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => remindPot(pot)} disabled={busyId === pot.id}>
                          {busyId === pot.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                          Relancer les familles
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => transferToTreasury(pot)} disabled={busyId === pot.id}>
                          <Banknote className="h-3 w-3 mr-1" />
                          Verser à la trésorerie
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {isCoach && pot.status === "open" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => {
                      const supabase = createClient();
                      supabase.from("team_pots").update({ status: "closed" }).eq("id", pot.id).then(() => {
                        setPots((prev) => prev.map((p) => (p.id === pot.id ? { ...p, status: "closed" } : p)));
                      });
                    }}>
                      Clôturer
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => deletePot(pot)}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      Supprimer
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle cagnotte</DialogTitle>
            <DialogDescription>Ex: tournoi d&apos;été, tenue de match, bus pour le déplacement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Titre</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Tournoi de Croix" className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm mt-1" rows={2} />
            </div>
            <div>
              <Label className="text-xs">Objectif (€) — optionnel</Label>
              <Input type="number" min={0} step="0.01" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex: 500" className="text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={createPot} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!contribFor} onOpenChange={(o) => !o && setContribFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Participer à la cagnotte</DialogTitle>
            <DialogDescription>{contribFor?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Votre nom</Label>
              <Input value={contribName} onChange={(e) => setContribName(e.target.value)} placeholder="Ex: Famille Martin" className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Montant (€)</Label>
              <Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ex: 20" className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Mode de paiement</Label>
              <div className="flex gap-2 mt-1">
                {(["cash", "bank", "app"] as const).map((m) => (
                  <Button key={m} size="sm" variant={method === m ? "default" : "outline"} className="h-8 text-xs capitalize" onClick={() => setMethod(m)}>
                    {m === "cash" ? "Espèces" : m === "bank" ? "Virement" : "App"}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Message — optionnel</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="text-sm mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setContribFor(null)}>Annuler</Button>
            <Button size="sm" onClick={contribute} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Contribuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
