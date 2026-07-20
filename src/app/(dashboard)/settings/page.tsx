"use client";

import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Shield, Bell } from "lucide-react";

const roleLabels = {
  coach: "Coach",
  player: "Joueur",
  parent: "Parent",
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Paramètres</h2>
        <p className="text-muted-foreground mt-1">
          Gérez votre profil et vos préférences
        </p>
      </div>

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
              <AvatarImage src={user?.avatarUrl || undefined} />
              <AvatarFallback className="bg-[var(--royal)] text-[var(--royal-foreground)] text-lg font-bold">
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">
                {user?.firstName} {user?.lastName}
              </h3>
              <Badge
                variant="secondary"
                className="mt-1"
              >
                {roleLabels[user?.role || "player"]}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifications push</p>
              <p className="text-xs text-muted-foreground">
                Recevoir les alertes dans le navigateur
              </p>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-[var(--royal)]">
              <span className="inline-block h-4 w-4 translate-x-6 rounded-full bg-white transition-transform" />
            </button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Emails de relance</p>
              <p className="text-xs text-muted-foreground">
                Rappels pour les convocations en attente
              </p>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-[var(--royal)]">
              <span className="inline-block h-4 w-4 translate-x-6 rounded-full bg-white transition-transform" />
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Gestion du mot de passe et du compte disponible prochainement.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
