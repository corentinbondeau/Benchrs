"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { UserClub } from "@/lib/useUserClubs";

export function ClubPageShell({
  title,
  subtitle,
  clubs,
  clubId,
  onChangeClub,
  loading,
  actions,
  children,
  comiteOnly = false,
}: {
  title: string;
  subtitle?: string;
  clubs: UserClub[];
  clubId: string | null;
  onChangeClub: (id: string) => void;
  loading: boolean;
  actions?: ReactNode;
  children: ReactNode;
  comiteOnly?: boolean;
}) {
  const selected = clubs.find((c) => c.club_id === clubId) ?? null;
  const restricted = comiteOnly && clubId != null && selected?.role == null;
  return (
    <div className="max-w-5xl mx-auto section-gap">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-6 w-6 text-[var(--color-royal)] shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {clubs.length > 1 && clubId && (
            <Select value={clubId} onValueChange={(v) => onChangeClub(v ?? "")}>
              <SelectTrigger className="w-52 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clubs.map((c) => (
                  <SelectItem key={c.club_id} value={c.club_id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Chargement…
          </CardContent>
        </Card>
      ) : !clubId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Aucun club trouvé. Rejoignez un club ou une équipe pour accéder
              à cet espace.
            </p>
          </CardContent>
        </Card>
      ) : restricted ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Accès réservé au comité du club.
            </p>
          </CardContent>
        </Card>
      ) : (
        children
      )}
    </div>
  );
}