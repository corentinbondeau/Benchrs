"use client";

import { useState } from "react";
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
import type { Profile, UserRole } from "@/types";

interface PlayerFormDialogProps {
  player?: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}

const positions = ["Gardien", "Défenseur", "Milieu", "Attaquant"];

export function PlayerFormDialog({ player, onClose, onSaved }: PlayerFormDialogProps) {
  const [formData, setFormData] = useState({
    firstName: player?.first_name || "",
    lastName: player?.last_name || "",
    email: "",
    password: "",
    role: (player?.role || "player") as UserRole,
    phone: player?.phone || "",
    position: player?.position || "",
    shirtNumber: player?.shirt_number?.toString() || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (player) {
        const res = await fetch(`/api/admin/players/${player.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: formData.firstName,
            lastName: formData.lastName,
            phone: formData.phone || null,
            position: formData.position || null,
            shirtNumber: formData.shirtNumber || null,
            role: formData.role,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Erreur lors de la mise à jour");
          setLoading(false);
          return;
        }
      } else {
        if (!formData.email || !formData.password) {
          setError("Email et mot de passe requis pour un nouveau joueur");
          setLoading(false);
          return;
        }

        const res = await fetch("/api/admin/players", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            firstName: formData.firstName,
            lastName: formData.lastName,
            role: formData.role,
            phone: formData.phone || undefined,
            position: formData.position || undefined,
            shirtNumber: formData.shirtNumber || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Erreur lors de la création");
          setLoading(false);
          return;
        }
      }

      onSaved();
      onClose();
    } catch {
      setError("Erreur de connexion");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Prénom *</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Nom *</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            required
          />
        </div>
      </div>

      {!player && (
        <>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe * (min. 8 caractères)</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={8}
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Rôle</Label>
        <Select
          value={formData.role}
            onValueChange={(v) => setFormData({ ...formData, role: (v ?? "player") as UserRole })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="player">🏃 Joueur</SelectItem>
            <SelectItem value="parent">👨‍👩‍👧 Parent</SelectItem>
            <SelectItem value="coach">🧢 Coach</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Téléphone</Label>
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Poste</Label>
          <Select
            value={formData.position}
            onValueChange={(v) => setFormData({ ...formData, position: v ?? "" })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir..." />
            </SelectTrigger>
            <SelectContent>
              {positions.map((pos) => (
                <SelectItem key={pos} value={pos}>
                  {pos}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="shirtNumber">Numéro</Label>
          <Input
            id="shirtNumber"
            type="number"
            min="0"
            max="99"
            value={formData.shirtNumber}
            onChange={(e) => setFormData({ ...formData, shirtNumber: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button
          type="submit"
          className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
          disabled={loading}
        >
          {loading ? "Enregistrement..." : player ? "Mettre à jour" : "Créer"}
        </Button>
      </div>
    </form>
  );
}
