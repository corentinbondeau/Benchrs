"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShoppingBag, Plus, Pencil, Trash2, Lock, Truck } from "lucide-react";
import { toast } from "sonner";

type OrderStatus = "draft" | "open" | "closed" | "delivered" | "cancelled";
interface Order {
  id: string;
  title: string;
  season: string | null;
  status: OrderStatus;
  description: string | null;
  closes_at: string | null;
  created_at: string;
}
interface Item {
  id: string;
  order_id: string;
  name: string;
  sizes: string[];
  sort_order: number;
}
interface Choice {
  id: string;
  order_id: string;
  item_id: string;
  player_id: string | null;
  user_id: string;
  size: string;
  quantity: number;
  note: string | null;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Brouillon",
  open: "Ouverte",
  closed: "Clôturée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export default function ClubEquipmentPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [players, setPlayers] = useState<{ id: string; label: string }[]>([]);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [title, setTitle] = useState("");
  const [season, setSeason] = useState("");
  const [description, setDescription] = useState("");
  const [itemsDraft, setItemsDraft] = useState("");

  const load = useCallback(async (cid: string, uid: string) => {
    const { data: ordersData } = await supabaseRef.current
      .from("equipment_orders")
      .select("*")
      .eq("club_id", cid)
      .order("created_at", { ascending: false });
    const orderRows = ((ordersData || []) as Record<string, unknown>[]).map((o) => ({
      id: o.id as string,
      title: o.title as string,
      season: (o.season as string | null) ?? null,
      status: o.status as OrderStatus,
      description: (o.description as string | null) ?? null,
      closes_at: (o.closes_at as string | null) ?? null,
      created_at: o.created_at as string,
    }));

    let itemRows: Item[] = [];
    let choiceRows: Choice[] = [];
    if (orderRows.length > 0) {
      const oids = orderRows.map((o) => o.id);
      const [{ data: itemsData }, { data: choicesData }] = await Promise.all([
        supabaseRef.current.from("equipment_items").select("*").in("order_id", oids),
        supabaseRef.current.from("equipment_choices").select("*").in("order_id", oids),
      ]);
      itemRows = ((itemsData || []) as Record<string, unknown>[]).map((i) => ({
        id: i.id as string,
        order_id: i.order_id as string,
        name: i.name as string,
        sizes: (i.sizes as string[]) || [],
        sort_order: (i.sort_order as number) ?? 0,
      }));
      choiceRows = ((choicesData || []) as Record<string, unknown>[]).map((c) => ({
        id: c.id as string,
        order_id: c.order_id as string,
        item_id: c.item_id as string,
        player_id: (c.player_id as string | null) ?? null,
        user_id: c.user_id as string,
        size: c.size as string,
        quantity: (c.quantity as number) ?? 1,
        note: (c.note as string | null) ?? null,
      }));
    }

    // Options « pour qui » : le user s'il est joueur + ses enfants (parent_student).
    const playerIds: string[] = [];
    const { data: teamsRes } = await supabaseRef.current.from("teams").select("id").eq("club_id", cid);
    const teamIds = ((teamsRes || []) as { id: string }[]).map((t) => t.id);
    if (teamIds.length > 0) {
      const { data: tms } = await supabaseRef.current
        .from("team_members")
        .select("user_id")
        .in("team_id", teamIds)
        .eq("user_id", uid)
        .eq("role", "player");
      if ((tms || []).length > 0) playerIds.push(uid);
      const { data: links } = await supabaseRef.current
        .from("parent_student")
        .select("student_id")
        .eq("parent_id", uid)
        .in("team_id", teamIds);
      for (const l of (links || []) as { student_id: string }[]) {
        if (!playerIds.includes(l.student_id)) playerIds.push(l.student_id);
      }
    }
    const playerOptions: { id: string; label: string }[] = [];
    if (playerIds.length > 0) {
      const { data: profiles } = await supabaseRef.current
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", playerIds);
      for (const p of (profiles || []) as { id: string; first_name: string | null; last_name: string | null }[]) {
        const label =
          p.id === uid
            ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Moi"
            : `Enfant · ${(p.first_name ?? "").trim()} ${(p.last_name ?? "").trim()}`.trim();
        playerOptions.push({ id: p.id, label });
      }
    }

    return { orders: orderRows, items: itemRows, choices: choiceRows, players: playerOptions };
  }, []);

  useEffect(() => {
    if (!clubId || !user) return;
    load(clubId, user.id).then((res) => {
      setOrders(res.orders);
      setItems(res.items);
      setChoices(res.choices);
      setPlayers(res.players);
      setPageLoading(false);
    });
  }, [clubId, user, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  function refresh() {
    if (clubId && user) {
      load(clubId, user.id).then((res) => {
        setOrders(res.orders);
        setItems(res.items);
        setChoices(res.choices);
        setPlayers(res.players);
      });
    }
  }

  function parseItemsDraft(): { name: string; sizes: string[] }[] {
    return itemsDraft
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const sep = line.indexOf("—");
        const name = (sep >= 0 ? line.slice(0, sep) : line).trim();
        const sizesPart = sep >= 0 ? line.slice(sep + 1) : "";
        const sizes = sizesPart
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        return { name, sizes };
      })
      .filter((i) => i.name);
  }

  async function saveOrder() {
    if (!clubId || !user || !title.trim()) {
      toast.error("Titre requis");
      return;
    }
    const parsed = parseItemsDraft();
    if (editingOrder) {
      const { error: orderErr } = await supabaseRef.current
        .from("equipment_orders")
        .update({
          title: title.trim(),
          season: season.trim() || null,
          description: description.trim() || null,
        })
        .eq("id", editingOrder.id)
        .eq("club_id", clubId);
      if (orderErr) {
        toast.error(orderErr.message);
        return;
      }
      const existing = items.filter((i) => i.order_id === editingOrder.id);
      if (existing.length > 0) {
        await supabaseRef.current.from("equipment_items").delete().in("id", existing.map((i) => i.id));
      }
      if (parsed.length > 0) {
        const { error: itemsErr } = await supabaseRef.current.from("equipment_items").insert(
          parsed.map((it, idx) => ({
            order_id: editingOrder.id,
            name: it.name,
            sizes: it.sizes,
            sort_order: idx,
          }))
        );
        if (itemsErr) {
          toast.error(itemsErr.message);
          return;
        }
      }
      toast.success("Commande mise à jour");
    } else {
      const { data: inserted, error: orderErr } = await supabaseRef.current
        .from("equipment_orders")
        .insert({
          club_id: clubId,
          title: title.trim(),
          season: season.trim() || null,
          description: description.trim() || null,
          status: "draft",
          created_by: user.id,
        })
        .select("id")
        .maybeSingle();
      if (orderErr || !inserted) {
        toast.error(orderErr?.message ?? "Erreur");
        return;
      }
      if (parsed.length > 0) {
        const { error: itemsErr } = await supabaseRef.current.from("equipment_items").insert(
          parsed.map((it, idx) => ({
            order_id: (inserted as { id: string }).id,
            name: it.name,
            sizes: it.sizes,
            sort_order: idx,
          }))
        );
        if (itemsErr) {
          toast.error(itemsErr.message);
          return;
        }
      }
      toast.success("Commande créée");
    }
    setCreateOpen(false);
    setEditingOrder(null);
    setTitle("");
    setSeason("");
    setDescription("");
    setItemsDraft("");
    refresh();
  }

  async function setOrderStatus(order: Order, status: OrderStatus) {
    const { error } = await supabaseRef.current
      .from("equipment_orders")
      .update({ status })
      .eq("id", order.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(STATUS_LABEL[status]);
    refresh();
  }

  async function deleteOrder(order: Order) {
    if (!confirm(`Supprimer la commande « ${order.title} » ?`)) return;
    const { error } = await supabaseRef.current
      .from("equipment_orders")
      .delete()
      .eq("id", order.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  const orderItems = (orderId: string) =>
    items.filter((i) => i.order_id === orderId).sort((a, b) => a.sort_order - b.sort_order);
  const orderChoices = (orderId: string) => choices.filter((c) => c.order_id === orderId);
  const playerLabel = (id: string | null) =>
    players.find((p) => p.id === id)?.label ?? (id === user?.id ? "Moi" : "Joueur");

  async function saveChoice(orderId: string, itemId: string, playerId: string, size: string, quantity: number) {
    if (!user) return;
    const { error } = await supabaseRef.current.from("equipment_choices").upsert(
      {
        order_id: orderId,
        item_id: itemId,
        player_id: playerId,
        user_id: user.id,
        size,
        quantity,
      },
      { onConflict: "order_id,item_id,player_id,user_id" }
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Choix enregistré");
    refresh();
  }

  async function deleteChoice(choiceId: string) {
    if (!user) return;
    const { error } = await supabaseRef.current
      .from("equipment_choices")
      .delete()
      .eq("id", choiceId)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  function openCreate() {
    setEditingOrder(null);
    setTitle("");
    setSeason("");
    setDescription("");
    setItemsDraft("");
    setCreateOpen(true);
  }
  function openEdit(order: Order) {
    setEditingOrder(order);
    setTitle(order.title);
    setSeason(order.season ?? "");
    setDescription(order.description ?? "");
    setItemsDraft(
      orderItems(order.id)
        .map((i) => `${i.name} — ${i.sizes.join(", ")}`)
        .join("\n")
    );
    setCreateOpen(true);
  }

  return (
    <ClubPageShell
      title="Commandes d'équipement"
      subtitle="Maillots, survêtements, chaussettes : le comité centralise les tailles par famille"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || (clubId ? pageLoading : false)}
      comiteOnly
      actions={
        isCommittee ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouvelle commande
          </Button>
        ) : undefined
      }
    >
      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-[var(--color-royal)]" />
              {editingOrder ? "Modifier la commande" : "Nouvelle commande"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="eq-title">Titre</Label>
              <Input
                id="eq-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. : Maillots domicile U18"
                maxLength={150}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-season">Saison (optionnel)</Label>
              <Input id="eq-season" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Ex. : 2026-2027" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-desc">Description (optionnel)</Label>
              <Input id="eq-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Référence fournisseur, délais…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-items">Articles — une ligne par article : nom — taille1, taille2…</Label>
              <textarea
                id="eq-items"
                value={itemsDraft}
                onChange={(e) => setItemsDraft(e.target.value)}
                placeholder={"Maillot match — 4XS, XS, S, M, L, XL\nShort — S, M, L\nSurvêtement complet — XS, S, M, L"}
                rows={4}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button onClick={saveOrder} disabled={!title.trim()}>
                {editingOrder ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {orders.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucune commande pour le moment.
            </CardContent>
          </Card>
        )}
        {orders.map((order) => {
          const oItems = orderItems(order.id);
          const oChoices = orderChoices(order.id);
          const isOpen = order.status === "open";
          const canChoose = isOpen && !isCommittee && players.length > 0;
          return (
            <Card key={order.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{order.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant={order.status === "open" ? "default" : "secondary"}>
                        {STATUS_LABEL[order.status]}
                      </Badge>
                      {order.season && <span className="text-xs text-muted-foreground">{order.season}</span>}
                      <span className="text-xs text-muted-foreground">
                        {oChoices.length} choix · {oItems.length} article{oItems.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    {order.description && <p className="text-sm text-muted-foreground mt-1">{order.description}</p>}
                  </div>
                  {isCommittee && (
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {order.status === "draft" && (
                        <Button variant="outline" size="sm" onClick={() => setOrderStatus(order, "open")}>
                          <Lock className="h-3 w-3 mr-1" />
                          Ouvrir
                        </Button>
                      )}
                      {isOpen && (
                        <Button variant="outline" size="sm" onClick={() => setOrderStatus(order, "closed")}>
                          Clôturer
                        </Button>
                      )}
                      {order.status === "closed" && (
                        <Button variant="outline" size="sm" onClick={() => setOrderStatus(order, "delivered")}>
                          <Truck className="h-3 w-3 mr-1" />
                          Livrée
                        </Button>
                      )}
                      {["open", "closed"].includes(order.status) && (
                        <Button variant="outline" size="sm" onClick={() => setOrderStatus(order, "draft")}>
                          Brouillon
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(order)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteOrder(order)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {oItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun article défini.</p>
                ) : (
                  oItems.map((item) => {
                    const itemChoices = oChoices.filter((c) => c.item_id === item.id);
                    const myChoices = itemChoices.filter((c) => c.user_id === user?.id);
                    const sizeCounts = itemChoices.reduce<Record<string, number>>((acc, c) => {
                      acc[c.size] = (acc[c.size] || 0) + c.quantity;
                      return acc;
                    }, {});
                    const chosenPlayerIds = new Set(myChoices.map((c) => c.player_id));
                    const available = players.filter((p) => !chosenPlayerIds.has(p.id));
                    return (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-sm">{item.name}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {isCommittee &&
                              Object.entries(sizeCounts).map(([size, count]) => (
                                <Badge key={size} variant="secondary">
                                  {size} × {count}
                                </Badge>
                              ))}
                            {canChoose &&
                              myChoices.map((c) => (
                                <Badge key={`${c.id}-mine`} variant="outline" className="border-[var(--color-gold)]">
                                  {playerLabel(c.player_id)} · {c.size} × {c.quantity}
                                  <button
                                    className="ml-1.5 text-destructive"
                                    onClick={() => deleteChoice(c.id)}
                                    aria-label="Supprimer le choix"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                          </div>
                        </div>
                        {myChoices.length === 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {canChoose ? "Votre taille n'a pas encore été indiquée." : "—"}
                          </p>
                        )}
                        {canChoose && (
                          <ItemChoiceForm
                            key={`${item.id}-${available.length}`}
                            players={available}
                            item={item}
                            defaultPlayer={available[0]?.id ?? ""}
                            onSave={(pid, size, qty) => saveChoice(order.id, item.id, pid, size, qty)}
                          />
                        )}
                        {!isOpen && !isCommittee && myChoices.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">Choix verrouillé (commande clôturée).</p>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ClubPageShell>
  );
}

function ItemChoiceForm({
  item,
  players,
  defaultPlayer,
  onSave,
}: {
  item: Item;
  players: { id: string; label: string }[];
  defaultPlayer: string;
  onSave: (playerId: string, size: string, quantity: number) => void;
}) {
  const [playerId, setPlayerId] = useState(defaultPlayer);
  const [size, setSize] = useState(item.sizes[0] ?? "");
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      {players.length > 1 && (
        <div className="space-y-1">
          <Label className="text-xs">Pour qui</Label>
          <Select value={playerId} onValueChange={(v) => setPlayerId(v ?? "")}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {players.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Taille</Label>
        {item.sizes.length > 0 ? (
          <Select value={size} onValueChange={(v) => setSize(v ?? "")}>
            <SelectTrigger className="w-28 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {item.sizes.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="Taille" className="w-28 h-9" />
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Quantité</Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          className="w-20 h-9"
        />
      </div>
      <Button size="sm" onClick={() => onSave(playerId, size, quantity)} disabled={!playerId || !size}>
        Enregistrer
      </Button>
    </div>
  );
}