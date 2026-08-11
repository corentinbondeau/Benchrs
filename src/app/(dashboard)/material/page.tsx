"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
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
  Shirt,
  Volleyball,
  Briefcase,
  Plus,
  Trash2,
  Handshake,
  Undo2,
  Loader2,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile, InventoryItem, ItemLoan } from "@/types";

const CATEGORIES: { value: InventoryItem["category"]; label: string; icon: typeof Shirt }[] = [
  { value: "maillots", label: "Maillots", icon: Shirt },
  { value: "ballons", label: "Ballons", icon: Volleyball },
  { value: "trousses", label: "Trousses", icon: Briefcase },
  { value: "medical", label: "Médical", icon: Package },
  { value: "autre", label: "Autre", icon: Package },
];

interface Data {
  items: InventoryItem[];
  loans: ItemLoan[];
  players: Profile[];
}

interface ClubTeamRow {
  id: string;
  name: string;
}

export default function MaterialPage() {
  const { currentTeam, clubMemberships } = useTeam();
  const { user } = useAuth();
  const hasClubRole = clubMemberships.length > 0;
  const canManage = hasClubRole;
  const clubId = currentTeam?.club_id ?? clubMemberships[0]?.club_id ?? null;
  const [data, setData] = useState<Data | null>(null);
  const [clubTeams, setClubTeams] = useState<ClubTeamRow[]>([]);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [itemOpen, setItemOpen] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemCategory, setItemCategory] = useState<InventoryItem["category"]>("maillots");
  const [itemQty, setItemQty] = useState("1");
  const [itemNotes, setItemNotes] = useState("");
  const [itemTeam, setItemTeam] = useState("");
  const [saving, setSaving] = useState(false);

  const [loanOpen, setLoanOpen] = useState(false);
  const [loanItem, setLoanItem] = useState<InventoryItem | null>(null);
  const [loanPlayer, setLoanPlayer] = useState("");
  const [loanQty, setLoanQty] = useState("1");

  const effectiveTeamId = viewTeamId || currentTeam?.id || clubTeams[0]?.id || null;

  const loadData = useCallback(async (): Promise<{ data: Data; teams: ClubTeamRow[] } | null> => {
    if (!effectiveTeamId) return null;
    const supabase = createClient();
    const [itemsRes, loansRes, membersRes, teamsRes] = await Promise.all([
      supabase.from("inventory_items").select("*").eq("team_id", effectiveTeamId).order("name", { ascending: true }),
      supabase.from("item_loans").select("*").eq("team_id", effectiveTeamId).order("loaned_at", { ascending: false }),
      supabase.from("team_members").select("user_id").eq("team_id", effectiveTeamId).in("role", ["player"]),
      clubId
        ? supabase.from("teams").select("id, name").eq("club_id", clubId).order("name", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);
    let players: Profile[] = [];
    const memberIds = (membersRes.data || []).map((m) => m.user_id);
    if (memberIds.length > 0) {
      const { data: p } = await supabase.from("profiles").select("*").in("id", memberIds).order("last_name", { ascending: true });
      players = (p as Profile[]) || [];
    }
    return {
      data: {
        items: (itemsRes.data as InventoryItem[]) || [],
        loans: (loansRes.data as ItemLoan[]) || [],
        players,
      },
      teams: (teamsRes.data || []) as ClubTeamRow[],
    };
  }, [effectiveTeamId, clubId]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (cancelled || !res) return;
      setData(res.data);
      setClubTeams(res.teams);
      if (!viewTeamId && effectiveTeamId) setViewTeamId(effectiveTeamId);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadData, effectiveTeamId, viewTeamId]);

  async function refresh() {
    const res = await loadData();
    if (res) {
      setData(res.data);
      setClubTeams(res.teams);
    }
  }

  async function handleAddItem() {
    if (!effectiveTeamId || !user) return;
    const targetTeam = itemTeam || effectiveTeamId;
    const qty = parseInt(itemQty, 10);
    if (!itemName.trim() || isNaN(qty) || qty <= 0) {
      toast.error("Nom et quantité invalides");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("inventory_items").insert({
      team_id: targetTeam,
      name: itemName.trim(),
      category: itemCategory,
      quantity: qty,
      notes: itemNotes.trim() || null,
      created_by: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erreur");
      return;
    }
    toast.success("Matériel ajouté");
    setItemOpen(false);
    setItemName("");
    setItemNotes("");
    setItemQty("1");
    setItemTeam("");
    refresh();
  }

  async function handleDeleteItem(item: InventoryItem) {
    if (!confirm(`Supprimer « ${item.name} » ?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) {
      toast.error(error.message || "Erreur");
      return;
    }
    toast.success("Matériel supprimé");
    refresh();
  }

  async function handleCreateLoan() {
    if (!loanItem || !loanPlayer || !effectiveTeamId) return;
    const qty = parseInt(loanQty, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantité invalide");
      return;
    }
    const activeLoanQty = (data?.loans || [])
      .filter((l) => l.item_id === loanItem.id && !l.returned_at)
      .reduce((s, l) => s + l.quantity, 0);
    if (activeLoanQty + qty > loanItem.quantity) {
      toast.error("Stock insuffisant");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("item_loans").insert({
      team_id: effectiveTeamId,
      item_id: loanItem.id,
      player_id: loanPlayer,
      quantity: qty,
      loaned_at: new Date().toISOString().slice(0, 10),
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erreur");
      return;
    }
    toast.success("Prêt enregistré");
    setLoanOpen(false);
    setLoanPlayer("");
    setLoanQty("1");
    refresh();
  }

  async function handleReturn(loan: ItemLoan) {
    const supabase = createClient();
    const { error } = await supabase
      .from("item_loans")
      .update({ returned_at: new Date().toISOString().slice(0, 10) })
      .eq("id", loan.id);
    if (error) {
      toast.error(error.message || "Erreur");
      return;
    }
    toast.success("Retour enregistré");
    refresh();
  }

  const playerName = (id: string) => {
    const p = data?.players.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : "Joueur";
  };

  if (!effectiveTeamId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-[var(--color-royal)]" />
            Matériel
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Inventaire du club : liste du matériel saisi par le comité.
          </p>
        </div>
        {hasClubRole && clubTeams.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">Équipe :</Label>
            <Select
              value={effectiveTeamId ?? ""}
              onValueChange={(v) => v && setViewTeamId(v)}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clubTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {canManage && (
          <Button
            className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            onClick={() => {
              setItemTeam(effectiveTeamId ?? "");
              setItemOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Ajouter du matériel
          </Button>
        )}
      </div>

      {loading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const items = data.items.filter((i) => i.category === cat.value);
              const totalQty = items.reduce((s, i) => s + i.quantity, 0);
              const activeLoans = data.loans.filter((l) => !l.returned_at && items.some((i) => i.id === l.item_id));
              return (
                <Card key={cat.value}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-royal)]/10 text-[var(--color-royal)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{cat.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {totalQty} unité{totalQty > 1 ? "s" : ""} · {activeLoans.length} prêt{activeLoans.length > 1 ? "s" : ""} en cours
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Inventaire</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y">
              {data.items.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aucun matériel enregistré{canManage ? " — le comité peut ajouter le premier." : "."}
                </p>
              )}
              {data.items.map((item) => {
                const cat = CATEGORIES.find((c) => c.value === item.category) || CATEGORIES[4];
                const Icon = cat.icon;
                const activeLoans = data.loans.filter((l) => l.item_id === item.id && !l.returned_at);
                const available = item.quantity - activeLoans.reduce((s, l) => s + l.quantity, 0);
                return (
                  <div key={item.id} className="flex items-center justify-between gap-2 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-[var(--color-royal)]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cat.label} · {item.quantity} total ·{" "}
                          <span className={available > 0 ? "text-emerald-600" : "text-red-600"}>
                            {available} disponible{available > 1 ? "s" : ""}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canManage && available > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => {
                            setLoanItem(item);
                            setLoanPlayer("");
                            setLoanQty("1");
                            setLoanOpen(true);
                          }}
                        >
                          <Handshake className="h-3 w-3 mr-1" /> Prêter
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600"
                          onClick={() => handleDeleteItem(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prêts en cours</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y">
              {data.loans.filter((l) => !l.returned_at).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Aucun prêt en cours</p>
              )}
              {data.loans
                .filter((l) => !l.returned_at)
                .map((loan) => {
                  const item = data.items.find((i) => i.id === loan.item_id);
                  return (
                    <div key={loan.id} className="flex items-center justify-between gap-2 p-4">
                      <div>
                        <p className="text-sm font-medium">
                          {playerName(loan.player_id)} — {item?.name ?? "Matériel"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {loan.quantity} unité{loan.quantity > 1 ? "s" : ""} · depuis le{" "}
                          {new Date(loan.loaned_at + "T00:00:00").toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                      <Badge variant="secondary">En cours</Badge>
                      {canManage && (
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleReturn(loan)}>
                          <Undo2 className="h-3 w-3 mr-1" /> Retour
                        </Button>
                      )}
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajouter du matériel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nom *</Label>
            <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Ex. Jeu de maillots jaunes" />
          </div>
          {hasClubRole && clubTeams.length > 0 && (
            <div className="space-y-2">
              <Label>Équipe de destination *</Label>
              <Select value={itemTeam || effectiveTeamId || ""} onValueChange={(v) => v && setItemTeam(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clubTeams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Catégorie</Label>
              <Select value={itemCategory} onValueChange={(v) => setItemCategory(v as InventoryItem["category"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Quantité *</Label>
                <Input type="number" min="1" value={itemQty} onChange={(e) => setItemQty(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optionnel)</Label>
              <Input value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} placeholder="Taille, marque, état..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemOpen(false)}>Annuler</Button>
            <Button disabled={!itemName.trim() || saving} onClick={handleAddItem}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={loanOpen} onOpenChange={setLoanOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Prêter du matériel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Matériel</Label>
              <p className="text-sm font-medium">{loanItem?.name}</p>
            </div>
            <div className="space-y-2">
              <Label>Joueur *</Label>
              <Select value={loanPlayer} onValueChange={(v) => setLoanPlayer(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un joueur" />
                </SelectTrigger>
                <SelectContent>
                  {data?.players.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantité</Label>
              <Input type="number" min="1" value={loanQty} onChange={(e) => setLoanQty(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoanOpen(false)}>Annuler</Button>
            <Button disabled={!loanPlayer || saving} onClick={handleCreateLoan}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Prêter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
