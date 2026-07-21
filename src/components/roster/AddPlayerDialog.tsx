"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AddPlayerDialogProps {
  onAdded?: () => void;
}

export function AddPlayerDialog({ onAdded }: AddPlayerDialogProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "SportPlus2026!",
    role: "player" as "player" | "parent",
    phone: "",
    position: "",
    shirtNumber: "",
  });

  const isCoach = session?.user?.role === "coach";
  if (!isCoach) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({ title: "Joueur ajouté", description: `${form.firstName} ${form.lastName} a été créé` });
      setOpen(false);
      setForm({ firstName: "", lastName: "", email: "", password: "SportPlus2026!", role: "player", phone: "", position: "", shirtNumber: "" });
      onAdded?.();
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90" />}>
        <Plus className="h-4 w-4 mr-1" />
        Ajouter
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un membre</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prénom *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>

          <div className="space-y-2">
            <Label>Rôle</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "player" | "parent" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="player">Joueur</SelectItem>
                <SelectItem value="parent">Parent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.role === "player" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Poste</Label>
                <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v || "" })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gardien">Gardien</SelectItem>
                    <SelectItem value="Défenseur">Défenseur</SelectItem>
                    <SelectItem value="Milieu">Milieu</SelectItem>
                    <SelectItem value="Attaquant">Attaquant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Numéro</Label>
                <Input type="number" min="1" max="99" value={form.shirtNumber} onChange={(e) => setForm({ ...form, shirtNumber: e.target.value })} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Téléphone</Label>
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>

          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Mot de passe par défaut : <strong>SportPlus2026!</strong> — Le joueur pourra le modifier.
          </div>

          <Button
            type="submit"
            className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
            disabled={loading || !form.firstName || !form.lastName || !form.email}
          >
            {loading ? "Création..." : "Ajouter le membre"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
