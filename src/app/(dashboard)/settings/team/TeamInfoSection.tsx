"use client";

import { useState, useEffect, useCallback } from "react";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Activity,
  CalendarDays,
  Copy,
  Flame,
  Link2,
  Loader2,
  Share2,
  RefreshCw,
  Pencil,
  Check,
  X,
  Clock,
  LayoutDashboard,
  MapPin,
  Trash2,
} from "lucide-react";
import { CHALLENGE_DIFFICULTIES, type ChallengeDifficulty } from "@/lib/challenges/ai-generator";
import { NAV_TABS } from "@/lib/tabs";
import type { TeamMember, Profile } from "@/types";
import type { TeamLocation } from "@/components/calendar/LocationPicker";

interface TeamInfoSectionProps {
  isOwner: boolean;
  isCoach: boolean;
}

export default function TeamInfoSection({ isOwner, isCoach }: TeamInfoSectionProps) {
  const { currentTeam, refreshTeams } = useTeam();
  const { user } = useAuth();
  const supabase = createClient();

  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(currentTeam?.name ?? "");
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>("moyen");
  const [savingDifficulty, setSavingDifficulty] = useState(false);
  const [enableRpe, setEnableRpe] = useState(false);
  const [savingRpe, setSavingRpe] = useState(false);
  const [minPlayingMinutes, setMinPlayingMinutes] = useState(0);
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [halfDuration, setHalfDuration] = useState(45);
  const [matchFormat, setMatchFormat] = useState(11);
  const [savingMatchSettings, setSavingMatchSettings] = useState(false);
  const [tabVisibility, setTabVisibility] = useState<Record<string, boolean>>({});
  const [savingTab, setSavingTab] = useState<string | null>(null);
  const [icsInfo, setIcsInfo] = useState<{
    webcalUrl: string;
    icsUrl: string;
    downloadUrl: string;
    teamName: string;
  } | null>(null);
  const [icsCopied, setIcsCopied] = useState(false);
  const [savedLocations, setSavedLocations] = useState<TeamLocation[]>([]);

  useEffect(() => {
    if (!currentTeam) return;
    const team = currentTeam;
    setNewName(team.name);

    supabase
      .from("weekly_challenge_settings")
      .select("difficulty")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.difficulty) setDifficulty(data.difficulty as ChallengeDifficulty);
      });

    supabase
      .from("team_settings")
      .select("enable_rpe, min_playing_minutes, half_duration, match_format")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => {
        setEnableRpe(data?.enable_rpe === true);
        setMinPlayingMinutes(data?.min_playing_minutes ?? 0);
        setHalfDuration(data?.half_duration ?? 45);
        setMatchFormat(data?.match_format ?? 11);
      });

    supabase
      .from("team_tab_visibility")
      .select("tab_key, visible")
      .eq("team_id", team.id)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        for (const t of NAV_TABS) map[t.key] = true;
        for (const row of (data ?? []) as { tab_key: string; visible: boolean }[]) {
          map[row.tab_key] = row.visible;
        }
        setTabVisibility(map);
      });

    supabase
      .from("team_locations")
      .select("id, team_id, name, address, created_by, created_at")
      .eq("team_id", team.id)
      .order("name", { ascending: true })
      .then(({ data }) => {
        setSavedLocations((data || []) as TeamLocation[]);
      });

    if (isCoach) {
      authFetch(`/api/calendar/url?teamId=${team.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.webcalUrl) setIcsInfo(d);
        })
        .catch(() => { /* lien calendrier indisponible */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeam, isCoach]);

  async function toggleTabVisibility(key: string, visible: boolean) {
    if (!currentTeam) return;
    setTabVisibility((prev) => ({ ...prev, [key]: visible }));
    setSavingTab(key);
    const { error } = await supabase
      .from("team_tab_visibility")
      .upsert(
        { team_id: currentTeam.id, tab_key: key, visible },
        { onConflict: "team_id,tab_key" }
      );
    setSavingTab(null);
    if (error) {
      toast.error("Erreur lors de l'enregistrement");
      setTabVisibility((prev) => ({ ...prev, [key]: !visible }));
      return;
    }
    toast.success(visible ? "Onglet affiché" : "Onglet masqué");
  }

  async function regenerateCode() {
    if (!currentTeam) return;
    const newCode = Array.from({ length: 12 }, () =>
      Math.random().toString(36).charAt(2)
    ).join("");
    const { error } = await supabase
      .from("teams")
      .update({ invite_code: newCode })
      .eq("id", currentTeam.id);
    if (error) {
      toast.error("Erreur lors de la régénération du code");
    } else {
      await refreshTeams();
      toast.success("Nouveau code généré !");
    }
  }

  function copyCode() {
    if (!currentTeam) return;
    navigator.clipboard.writeText(currentTeam.invite_code);
    setCopied(true);
    toast.success("Code copié !");
    setTimeout(() => setCopied(false), 2000);
  }

  function inviteLink() {
    if (!currentTeam) return "";
    return `${window.location.origin}/join?code=${currentTeam.invite_code}`;
  }

  function copyInviteLink() {
    if (!currentTeam) return;
    navigator.clipboard.writeText(inviteLink());
    setCopied(true);
    toast.success("Lien d'invitation copié !");
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareInviteLink() {
    if (!currentTeam) return;
    const link = inviteLink();
    const text = `🏟️ Rejoins l'équipe ${currentTeam.name} sur Benchrs !\n\nConvocations, stats, compositions, match en direct... tout est sur l'appli.\n\n👉 ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Rejoins ${currentTeam.name} sur Benchrs`,
          text,
          url: link,
        });
        return;
      } catch { /* fallback */ }
    }
    copyInviteLink();
  }

  async function saveTeamName() {
    if (!currentTeam || !newName.trim()) return;
    const { error } = await supabase
      .from("teams")
      .update({ name: newName.trim() })
      .eq("id", currentTeam.id);
    if (error) {
      toast.error("Erreur lors de la mise à jour");
    } else {
      await refreshTeams();
      setEditingName(false);
      toast.success("Nom mis à jour !");
    }
  }

  if (!currentTeam) return null;

  return (
    <>
      {/* Team Info + Invite Code */}
      <Card>
        <CardHeader>
          <CardTitle>{currentTeam.club?.name || "Club"}</CardTitle>
          <CardDescription>
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTeamName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNewName(currentTeam.name);
                    }
                  }}
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveTeamName}>
                  <Check className="h-4 w-4 text-green-500" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => { setEditingName(false); setNewName(currentTeam.name); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <span className="flex items-center gap-2">
                {currentTeam.name}
                {isOwner && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingName(true)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Lien d&apos;invitation</Label>
            <div className="flex gap-2">
              <Input value={inviteLink()} readOnly className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={copyInviteLink}>
                <Copy className={`h-4 w-4 ${copied ? "text-green-500" : ""}`} />
              </Button>
              <Button variant="outline" size="icon" onClick={shareInviteLink}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="w-full bg-[var(--color-primary-blue)] text-white font-semibold"
              onClick={copyInviteLink}
            >
              <Link2 className="h-4 w-4 mr-1" />
              {copied ? "Lien copié !" : "Copier le lien d'invitation"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Partagez ce lien pour que les joueurs rejoignent l&apos;équipe en un clic, plus besoin de saisir le code à la main.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Code d&apos;invitation</Label>
            <div className="flex gap-2">
              <Input value={currentTeam.invite_code} readOnly className="font-mono text-lg" />
              <Button variant="outline" size="icon" onClick={copyCode}>
                <Copy className="h-4 w-4" />
              </Button>
              {isOwner && (
                <Button variant="outline" size="icon" onClick={regenerateCode}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Code alternatif à saisir manuellement sur la page de rejointe
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Défi de la semaine */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5" />
              Défi de la semaine
            </CardTitle>
            <CardDescription>
              Difficulté du défi généré automatiquement chaque semaine par IA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1 rounded-lg border p-0.5 w-fit">
              {CHALLENGE_DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    difficulty === d
                      ? "bg-[var(--color-navy)] text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              disabled={savingDifficulty}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingDifficulty(true);
                const { error } = await supabase
                  .from("weekly_challenge_settings")
                  .upsert(
                    { team_id: currentTeam.id, difficulty, updated_by: user?.id ?? null },
                    { onConflict: "team_id" }
                  );
                setSavingDifficulty(false);
                if (error) toast.error("Erreur lors de l'enregistrement");
                else toast.success("Paramètre enregistré");
              }}
              variant="primary"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Suivi de charge RPE */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Suivi de charge (RPE)
            </CardTitle>
            <CardDescription>
              Les joueurs notent l&apos;intensité perçue (1-10) après chaque séance pour suivre la charge d&apos;entraînement et prévenir les blessures.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Activer le suivi</p>
                <p className="text-xs text-muted-foreground">
                  Affiche la carte « Suivi de charge » sur les fiches d&apos;entraînement.
                </p>
              </div>
              <Switch checked={enableRpe} onCheckedChange={(v) => setEnableRpe(v === true)} />
            </div>
            <Button
              size="sm"
              disabled={savingRpe}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingRpe(true);
                const { error } = await supabase
                  .from("team_settings")
                  .upsert(
                    { team_id: currentTeam.id, enable_rpe: enableRpe, updated_by: user?.id ?? null },
                    { onConflict: "team_id" }
                  );
                setSavingRpe(false);
                if (error) toast.error("Erreur lors de l'enregistrement");
                else toast.success("Paramètre enregistré");
              }}
              variant="primary"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Équité du temps de jeu */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Équité du temps de jeu
            </CardTitle>
            <CardDescription>
              Définissez un objectif de minutes minimum sur la saison. Les joueurs en dessous sont mis en évidence dans les statistiques et une alerte hebdomadaire est envoyée aux coachs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={6000}
                step={30}
                value={minPlayingMinutes}
                onChange={(e) => setMinPlayingMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0 = désactivé"
              />
              <span className="text-sm text-muted-foreground shrink-0">minutes / saison</span>
            </div>
            <Button
              size="sm"
              disabled={savingMinutes}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingMinutes(true);
                const { error } = await supabase
                  .from("team_settings")
                  .upsert(
                    { team_id: currentTeam.id, min_playing_minutes: minPlayingMinutes, updated_by: user?.id ?? null },
                    { onConflict: "team_id" }
                  );
                setSavingMinutes(false);
                if (error) toast.error("Erreur lors de l'enregistrement");
                else toast.success("Paramètre enregistré");
              }}
              variant="primary"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Paramètres de match */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Paramètres de match
            </CardTitle>
            <CardDescription>
              Configurez le format de match et la durée des mi-temps selon la catégorie de votre équipe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Durée mi-temps */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Durée d&apos;une mi-temps</p>
                <p className="text-xs text-muted-foreground">En minutes, selon la catégorie</p>
              </div>
              <select
                value={halfDuration}
                onChange={(e) => setHalfDuration(parseInt(e.target.value))}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value={20}>20 min</option>
                <option value={25}>25 min</option>
                <option value={30}>30 min</option>
                <option value={35}>35 min</option>
                <option value={40}>40 min</option>
                <option value={45}>45 min</option>
              </select>
            </div>

            {/* Format de match */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Format de match</p>
                <p className="text-xs text-muted-foreground">Nombre de joueurs sur le terrain</p>
              </div>
              <select
                value={matchFormat}
                onChange={(e) => setMatchFormat(parseInt(e.target.value))}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value={5}>5 contre 5</option>
                <option value={7}>7 contre 7</option>
                <option value={8}>8 contre 8</option>
                <option value={11}>11 contre 11</option>
              </select>
            </div>

            <Button
              size="sm"
              disabled={savingMatchSettings}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingMatchSettings(true);
                const { error } = await supabase
                  .from("team_settings")
                  .upsert(
                    { team_id: currentTeam.id, half_duration: halfDuration, match_format: matchFormat, updated_by: user?.id ?? null },
                    { onConflict: "team_id" }
                  );
                setSavingMatchSettings(false);
                if (error) toast.error("Erreur lors de l'enregistrement");
                else toast.success("Paramètres de match enregistrés");
              }}
              variant="primary"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Navigation de l'équipe */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" />
              Navigation de l&apos;équipe
            </CardTitle>
            <CardDescription>
              Choisissez les onglets visibles par toute l&apos;équipe. Les pages masquées disparaissent du menu (elles restent accessibles par lien direct).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {NAV_TABS.map((tab) => {
              const visible = tabVisibility[tab.key] ?? true;
              return (
                <div key={tab.key} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{tab.label}</p>
                    <p className="text-xs text-muted-foreground">{tab.href}</p>
                  </div>
                  <Switch
                    checked={visible}
                    disabled={savingTab === tab.key}
                    onCheckedChange={(v) => toggleTabVisibility(tab.key, v === true)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Synchronisation calendrier */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Synchronisation calendrier
            </CardTitle>
            <CardDescription>
              Abonnez-vous au calendrier de l&apos;équipe dans Google Calendar ou Apple Calendar : les matchs et entraînements apparaissent automatiquement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!icsInfo ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du lien...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Lien d&apos;abonnement (webcal)</Label>
                  <div className="flex gap-2">
                    <Input value={icsInfo.webcalUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(icsInfo.webcalUrl);
                          setIcsCopied(true);
                          setTimeout(() => setIcsCopied(false), 1500);
                        } catch {
                          toast.error("Copie impossible");
                        }
                      }}
                    >
                      <Copy className={`h-4 w-4 ${icsCopied ? "text-green-500" : ""}`} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            text: `Abonnez-vous au calendrier de ${icsInfo.teamName} (Benchrs)`,
                            url: icsInfo.webcalUrl,
                          });
                        } catch { /* partage annulé */ }
                      } else {
                        window.open(icsInfo.webcalUrl, "_blank");
                      }
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5 mr-1" />
                    Partager
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(icsInfo.downloadUrl, "_blank")}
                  >
                    Télécharger .ics
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Google Calendar : Paramètres → Ajouter depuis une URL puis collez le lien. Apple Calendar : Fichier → Nouvel abonnement au calendrier.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lieux enregistrés */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Lieux enregistrés
            </CardTitle>
            <CardDescription>
              Les lieux enregistrés sont réutilisables dans le calendrier lors de la création d&apos;événements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Lieux enregistrés ({savedLocations.length})</Label>
              {savedLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun lieu enregistré pour l&apos;instant. Enregistrez un lieu depuis le calendrier pour le retrouver ici.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {savedLocations.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{l.address}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={async () => {
                          const supabaseClient = createClient();
                          const { error } = await supabaseClient
                            .from("team_locations")
                            .delete()
                            .eq("id", l.id);
                          if (error) {
                            toast.error("Impossible de supprimer le lieu");
                            return;
                          }
                          setSavedLocations((prev) => prev.filter((x) => x.id !== l.id));
                          toast.success("Lieu supprimé");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
