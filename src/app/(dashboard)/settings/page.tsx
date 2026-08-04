"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  User,
  Palette,
  Shield,
  Bell,
  Save,
  Loader2,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { toast } from "sonner";
import { NOTIFICATION_TYPES } from "@/lib/notificationTypes";
import {
  isPushEnabledLocal,
  getPushSubscriptionCount,
  enablePushSubscription,
  disablePushSubscription,
} from "@/lib/push";
import { POSITIONS } from "@/lib/positions";
import type { Profile } from "@/types";

const roleLabels = { coach: "Coach", player: "Joueur", parent: "Parent" };

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isPlayer = userRole === "player";
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushPrefs, setPushPrefs] = useState<Record<string, boolean>>({});
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [pushMaster, setPushMaster] = useState<boolean>(() => isPushEnabledLocal());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (user?.profile) {
      const p = user.profile as Profile;
      setFirstName(p.first_name || "");
      setLastName(p.last_name || "");
      setPhone(p.phone || "");
      setPosition(p.position || "");
      setShirtNumber(p.shirt_number?.toString() || "");
      setDateOfBirth(p.date_of_birth || "");
      setEmailNotifications(p.email_notifications ?? true);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id || !currentTeam?.id) return;
    const supabase = createClient();
    supabase
      .from("notification_preferences")
      .select("type, push_enabled")
      .eq("user_id", user.id)
      .eq("team_id", currentTeam.id)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        for (const t of NOTIFICATION_TYPES) map[t.type] = true;
        for (const row of (data || []) as { type: string; push_enabled: boolean }[]) {
          map[row.type] = row.push_enabled;
        }
        setPushPrefs(map);
        setPrefsLoading(false);
      });
  }, [user?.id, currentTeam?.id]);

  useEffect(() => {
    if (!user?.id) return;
    getPushSubscriptionCount(user.id).then((n) => setPushSubscribed(n > 0));
  }, [user?.id]);

  async function togglePushMaster(enabled: boolean) {
    setPushBusy(true);
    setPushMaster(enabled);
    try {
      if (enabled) {
        const res = await enablePushSubscription(user!.id, currentTeam!.id);
        if (!res.ok) {
          setPushMaster(false);
          toast.error(res.error || "Activation impossible");
          return;
        }
        toast.success("Notifications push activées");
      } else {
        const res = await disablePushSubscription();
        if (!res.ok) {
          setPushMaster(true);
          toast.error(res.error || "Désactivation impossible");
          return;
        }
        toast.success("Notifications push désactivées");
      }
      getPushSubscriptionCount(user!.id).then((n) => setPushSubscribed(n > 0));
    } finally {
      setPushBusy(false);
    }
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l'équipe...</p></div>;
  }

  const hasProfileChanges =
    user?.profile &&
    (firstName !== (user.profile as Profile).first_name ||
      lastName !== (user.profile as Profile).last_name ||
      phone !== ((user.profile as Profile).phone || "") ||
      position !== ((user.profile as Profile).position || "") ||
      shirtNumber !== ((user.profile as Profile).shirt_number?.toString() || "") ||
      dateOfBirth !== ((user.profile as Profile).date_of_birth || "") ||
      emailNotifications !== ((user.profile as Profile).email_notifications ?? true));

  async function handleSaveProfile() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Le prénom et le nom sont requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          position: position || null,
          shirt_number: shirtNumber ? parseInt(shirtNumber) : null,
          date_of_birth: dateOfBirth || null,
          email_notifications: emailNotifications,
        })
        .eq("id", user!.id);
      if (error) throw error;
      toast.success("Profil mis à jour");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function togglePushType(type: string, enabled: boolean) {
    const supabase = createClient();
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        { user_id: user!.id, team_id: currentTeam!.id, type, push_enabled: enabled },
        { onConflict: "user_id,team_id,type" }
      );
    if (error) {
      toast.error("Erreur lors de l'enregistrement");
      return;
    }
    setPushPrefs((prev) => ({ ...prev, [type]: enabled }));
  }

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Minimum 8 caractères");
      return;
    }
    setChangingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Mot de passe mis à jour");
      setNewPassword("");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0 max-w-2xl">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">Paramètres</h2>
        <p className="text-sm text-muted-foreground mt-1">Gérez votre profil et vos préférences</p>
      </div>

      {/* Profile card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-[var(--color-royal)] text-white text-lg font-bold">
                {firstName?.[0]}{lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">
                {firstName} {lastName}
              </h3>
              <Badge variant="secondary" className="mt-1">
                {roleLabels[userRole === "owner" ? "coach" : (userRole || "player")]}
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date de naissance</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
            {isPlayer && (
              <div className="space-y-2">
                <Label htmlFor="position">Poste</Label>
                <select
                  id="position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Aucun</option>
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="shirtNumber">Numéro de maillot</Label>
              <Input
                id="shirtNumber"
                type="number"
                min={1}
                max={99}
                value={shirtNumber}
                onChange={(e) => setShirtNumber(e.target.value)}
                placeholder="10"
              />
            </div>
          </div>

          {hasProfileChanges && (
            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifications push</p>
              <p className="text-xs text-muted-foreground">
                {pushMaster
                  ? pushSubscribed
                    ? "Activées sur cet appareil"
                    : "Autorisation requise — activez-les pour les recevoir"
                  : "Désactivées"}
              </p>
            </div>
            <Switch
              checked={pushMaster}
              onCheckedChange={togglePushMaster}
              disabled={pushBusy}
            />
          </div>

          <Separator className="my-4" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifications par email</p>
              <p className="text-xs text-muted-foreground">
                Recevoir les convocations et rappels par email
              </p>
            </div>
            <Switch
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
            />
          </div>

          <Separator className="my-4" />

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Notifications push par motif</p>
              <p className="text-xs text-muted-foreground">
                Choisissez les motifs pour lesquels vous recevez des notifications push
              </p>
            </div>
            {prefsLoading ? (
              <div className="h-16 animate-pulse rounded-md bg-muted" />
            ) : (
              NOTIFICATION_TYPES.map((t) => (
                <div key={t.type} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <Switch
                    checked={!!pushPrefs[t.type]}
                    disabled={!pushMaster}
                    onCheckedChange={(v) => togglePushType(t.type, v)}
                  />
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Apparence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Thème sombre</p>
              <p className="text-xs text-muted-foreground">
                Basculer entre le thème clair et sombre
              </p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      {/* Lien parent → enfant */}
      {userRole === "parent" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Lien parent → enfant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Liez le compte de votre enfant pour suivre ses convocations,
              résultats et notifications.
            </p>
            <Link
              href={`/link-child?teamId=${currentTeam?.id}`}
              className="w-full"
            >
              <Button className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold">
                Lier mon enfant
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 caractères"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
            {changingPassword ? "Mise à jour..." : "Changer le mot de passe"}
          </Button>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Card>
        <CardContent className="pt-6">
          <Button variant="destructive" className="w-full" onClick={signOut}>
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
