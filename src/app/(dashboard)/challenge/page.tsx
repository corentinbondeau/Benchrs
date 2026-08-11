"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Crown,
  Flame,
  Loader2,
  Medal,
  PenLine,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getParentChildId } from "@/components/EventDetail";
import { CHALLENGE_DIFFICULTIES, type ChallengeDifficulty } from "@/lib/challenges/ai-generator";
import type { ChallengeSubmission, Profile, WeeklyChallengeRow } from "@/types";

function getWeekStart(date = new Date()): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function formatWeekStart(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  return `du ${d.toLocaleDateString("fr-FR", opts)} au ${end.toLocaleDateString("fr-FR", opts)}`;
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|m4v|avi)$/i.test(url.split("?")[0]);
}

const DIFFICULTY_BADGE: Record<ChallengeDifficulty, string> = {
  facile: "bg-green-100 text-green-700 border-green-200",
  moyen: "bg-amber-100 text-amber-700 border-amber-200",
  difficile: "bg-red-100 text-red-700 border-red-200",
};

interface PageData {
  challenge: WeeklyChallengeRow | null;
  difficulty: ChallengeDifficulty;
  history: WeeklyChallengeRow[];
  submissions: ChallengeSubmission[];
  players: Record<string, Profile>;
}

export default function ChallengePage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const weekStart = getWeekStart();

  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  const isCoach = userRole === "coach" || userRole === "owner";

  useEffect(() => {
    if (!user?.id || !currentTeam || isCoach) return;
    if (userRole === "parent") {
      getParentChildId(user.id, currentTeam.id).then(setChildId);
    }
  }, [user?.id, currentTeam, isCoach, userRole]);

  const loadData = useCallback(async (): Promise<PageData | null> => {
    if (!currentTeam) return null;
    const supabase = createClient();
    const [challengeRes, settingsRes, historyRes] = await Promise.all([
      supabase
        .from("weekly_challenges")
        .select("*")
        .eq("team_id", currentTeam.id)
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase
        .from("weekly_challenge_settings")
        .select("difficulty")
        .eq("team_id", currentTeam.id)
        .maybeSingle(),
      supabase
        .from("weekly_challenges")
        .select("*")
        .eq("team_id", currentTeam.id)
        .lt("week_start", weekStart)
        .order("week_start", { ascending: false })
        .limit(6),
    ]);

    const challenge = challengeRes.data as WeeklyChallengeRow | null;
    let submissions: ChallengeSubmission[] = [];
    let players: Record<string, Profile> = {};
    if (challenge) {
      const subsRes = await supabase
        .from("challenge_submissions")
        .select("*")
        .eq("challenge_id", challenge.id);
      submissions = (subsRes.data as ChallengeSubmission[]) || [];
      const playerIds = submissions.map((s) => s.player_id);
      if (playerIds.length > 0) {
        const profRes = await supabase
          .from("profiles")
          .select("*")
          .in("id", playerIds);
        players = ((profRes.data as Profile[]) || []).reduce<Record<string, Profile>>(
          (acc, p) => ({ ...acc, [p.id]: p }),
          {}
        );
      }
    }

    return {
      challenge,
      difficulty:
        (settingsRes.data?.difficulty as ChallengeDifficulty | undefined) ?? "moyen",
      history: (historyRes.data as WeeklyChallengeRow[]) || [],
      submissions,
      players,
    };
  }, [currentTeam, weekStart]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (cancelled) return;
      setData(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function refresh() {
    const res = await loadData();
    if (res) setData(res);
  }

  async function handleGenerate() {
    if (!data) return;
    setGenerating(true);
    try {
      const res = await authFetch("/api/challenges/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: currentTeam!.id,
          weekStart,
          difficulty: data.difficulty,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Erreur lors de la génération");
      }
      toast.success("Défi de la semaine généré !");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSetDifficulty(difficulty: ChallengeDifficulty) {
    if (!currentTeam) return;
    const supabase = createClient();
    const { error } = await supabase.from("weekly_challenge_settings").upsert(
      { team_id: currentTeam.id, difficulty, updated_by: user?.id ?? null },
      { onConflict: "team_id" }
    );
    if (error) {
      toast.error("Erreur lors de la mise à jour de la difficulté");
      return;
    }
    setData((prev) => (prev ? { ...prev, difficulty } : prev));
    toast.success("Difficulté mise à jour");
  }

  async function handleSaveManual() {
    if (!currentTeam || !data) return;
    if (!manualTitle.trim()) {
      toast.error("Donne un titre au défi");
      return;
    }
    if (!manualDescription.trim()) {
      toast.error("Décris le défi");
      return;
    }
    setSavingManual(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("weekly_challenges").upsert(
        {
          team_id: currentTeam.id,
          week_start: weekStart,
          title: manualTitle.trim(),
          description: manualDescription.trim(),
          difficulty: data.difficulty,
          created_by: user?.id ?? null,
        },
        { onConflict: "team_id,week_start" }
      );
      if (error) throw error;
      setManualOpen(false);
      setManualTitle("");
      setManualDescription("");
      toast.success("Défi de la semaine créé !");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSavingManual(false);
    }
  }

  async function handleSubmit() {
    if (!currentTeam || !data?.challenge) return;
    const playerId = userRole === "player" ? user?.id : childId;
    if (!playerId) return;
    if (!file) {
      toast.error("Ajoute une photo ou une vidéo");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `challenge/${currentTeam.id}/${playerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("challenge_media")
        .upload(path, buffer, { upsert: true, contentType: file.type });
      if (uploadError) throw new Error("Upload impossible");
      const { data: urlData } = supabase.storage.from("challenge_media").getPublicUrl(path);

      const existing = data.submissions.find((s) => s.player_id === playerId);
      if (existing && existing.status !== "validated") {
        if (existing.storage_path) {
          await supabase.storage.from("challenge_media").remove([existing.storage_path]);
        }
        const { error: updError } = await supabase
          .from("challenge_submissions")
          .update({
            media_url: urlData.publicUrl,
            storage_path: path,
            comment: comment.trim() || null,
            status: "pending",
          })
          .eq("id", existing.id);
        if (updError) throw new Error("Enregistrement impossible");
      } else {
        const { error: insError } = await supabase.from("challenge_submissions").upsert(
          {
            challenge_id: data.challenge.id,
            player_id: playerId,
            team_id: currentTeam.id,
            media_url: urlData.publicUrl,
            storage_path: path,
            comment: comment.trim() || null,
            status: "pending",
          },
          { onConflict: "challenge_id,player_id" }
        );
        if (insError) throw new Error("Enregistrement impossible");
      }

      setFile(null);
      setComment("");
      toast.success("Défi soumis !");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la soumission");
    } finally {
      setUploading(false);
    }
  }

  async function handleValidate(submissionId: string, status: "validated" | "rejected") {
    if (!currentTeam) return;
    setValidatingId(submissionId);
    const supabase = createClient();
    const { error } = await supabase
      .from("challenge_submissions")
      .update({ status, validated_by: user?.id ?? null })
      .eq("id", submissionId);
    setValidatingId(null);
    if (error) {
      toast.error("Erreur lors de la validation");
      return;
    }
    toast.success(status === "validated" ? "Défi validé !" : "Défi refusé");
    await refresh();
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;
  }

  if (loading || !data) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;
  }

  const validated = data.submissions
    .filter((s) => s.status === "validated")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const pending = data.submissions.filter((s) => s.status === "pending");
  const myPlayerId = userRole === "player" ? user?.id : childId;
  const mySubmission = myPlayerId
    ? data.submissions.find((s) => s.player_id === myPlayerId)
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-[var(--color-gold)]" />
        <h1 className="text-xl font-bold">Défi de la semaine</h1>
      </div>

      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Réglages du défi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Difficulté :</span>
              <div className="flex gap-1 rounded-lg border p-0.5">
                {CHALLENGE_DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSetDifficulty(d)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      data.difficulty === d
                        ? "bg-[var(--color-navy)] text-white"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              >
                {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                {generating ? "Génération en cours..." : data.challenge ? "Régénérer par IA" : "Générer par IA"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setManualTitle(data.challenge?.title || "");
                  setManualDescription(data.challenge?.description || "");
                  setManualOpen(true);
                }}
              >
                <PenLine className="mr-1 h-4 w-4" />
                {data.challenge ? "Modifier à la main" : "Créer à la main"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Génère le défi par IA selon la difficulté choisie, ou rédige-le toi-même. Les joueurs le valident ensuite par photo ou vidéo.
            </p>
          </CardContent>
        </Card>
      )}

      {data.challenge ? (
        <Card className="border-[var(--color-gold)]/40">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{data.challenge.title}</CardTitle>
                  <Badge className={DIFFICULTY_BADGE[data.challenge.difficulty]}>
                    {data.challenge.difficulty}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatWeekStart(data.challenge.week_start)}</p>
              </div>
              <Flame className="h-5 w-5 shrink-0 text-[var(--color-gold)]" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm whitespace-pre-wrap">{data.challenge.description}</p>

            {myPlayerId && mySubmission?.status === "validated" && (
              <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                Défi validé par le coach. Bravo !
              </p>
            )}
            {myPlayerId && mySubmission?.status === "rejected" && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                Défi refusé. Tu peux renvoyer une nouvelle photo/vidéo.
              </p>
            )}

            {myPlayerId && mySubmission?.status !== "validated" && (
              <div className="space-y-3 rounded-lg border border-dashed p-3">
                <p className="text-sm font-medium">
                  {mySubmission ? "Renvoyer ma preuve" : "Participer au défi"}
                </p>
                <Input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Petit commentaire (optionnel)"
                />
                <Button
                  onClick={handleSubmit}
                  disabled={uploading}
                  className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
                >
                  {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                  {uploading ? "Envoi en cours..." : "Envoyer ma preuve"}
                </Button>
              </div>
            )}

            {isCoach && pending.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  À valider ({pending.length})
                </p>
                {pending.map((s) => {
                  const profile = data.players[s.player_id];
                  return (
                    <div key={s.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {profile ? `${profile.first_name} ${profile.last_name}` : "Joueur"}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleValidate(s.id, "rejected")}
                            disabled={validatingId === s.id}
                          >
                            <X className="mr-1 h-3 w-3" />
                            Refuser
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleValidate(s.id, "validated")}
                            disabled={validatingId === s.id}
                            className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Valider
                          </Button>
                        </div>
                      </div>
                      {isVideo(s.media_url) ? (
                        <video
                          src={s.media_url}
                          controls
                          muted
                          playsInline
                          className="mt-2 max-h-56 rounded-lg bg-black"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.media_url}
                          alt="Preuve du défi"
                          className="mt-2 max-h-56 rounded-lg object-cover"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {isCoach && data.submissions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Toutes les preuves ({data.submissions.length})
                </p>
                {[...data.submissions]
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  )
                  .map((s) => {
                    const profile = data.players[s.player_id];
                    const statusBadge =
                      s.status === "validated"
                        ? "bg-green-100 text-green-700 border-green-200"
                        : s.status === "rejected"
                          ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-amber-100 text-amber-700 border-amber-200";
                    const statusLabel =
                      s.status === "validated"
                        ? "Validé"
                        : s.status === "rejected"
                          ? "Refusé"
                          : "En attente";
                    return (
                      <div key={s.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {profile ? `${profile.first_name} ${profile.last_name}` : "Joueur"}
                          </p>
                          <Badge className={statusBadge}>{statusLabel}</Badge>
                        </div>
                        {s.comment && (
                          <p className="mt-1 text-xs text-muted-foreground">{s.comment}</p>
                        )}
                        {isVideo(s.media_url) ? (
                          <video
                            src={s.media_url}
                            controls
                            muted
                            playsInline
                            className="mt-2 max-h-56 rounded-lg bg-black"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.media_url}
                            alt="Preuve du défi"
                            className="mt-2 max-h-56 rounded-lg object-cover"
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Flame className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isCoach
                ? "Aucun défi pour cette semaine. Clique sur « Générer le défi » pour le créer."
                : "Aucun défi pour cette semaine. Reviens bientôt !"}
            </p>
          </CardContent>
        </Card>
      )}

      {data.challenge && validated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Classement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {validated.map((s, i) => {
              const profile = data.players[s.player_id];
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border p-3">
                  {i === 0 ? (
                    <Crown className="h-5 w-5 shrink-0 text-[var(--color-gold)]" />
                  ) : i === 1 ? (
                    <Medal className="h-5 w-5 shrink-0 text-slate-400" />
                  ) : i === 2 ? (
                    <Medal className="h-5 w-5 shrink-0 text-amber-700" />
                  ) : (
                    <span className="w-5 text-center text-sm font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                  )}
                  <p className="flex-1 truncate text-sm font-medium">
                    {profile ? `${profile.first_name} ${profile.last_name}` : "Joueur"}
                  </p>
                  {isVideo(s.media_url) ? (
                    <video src={s.media_url} muted playsInline className="h-10 w-10 rounded-lg bg-black object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.media_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {data.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Semaines précédentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.history.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <p className="min-w-0 truncate text-sm">{c.title}</p>
                <Badge className={`shrink-0 ${DIFFICULTY_BADGE[c.difficulty]}`}>{c.difficulty}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rédiger le défi de la semaine</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Titre</Label>
              <Input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Ex : 50 jonglages en une minute"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Description</Label>
              <Textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Décris le défi, les règles, le matériel éventuel..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Annuler</Button>
            <Button
              className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={handleSaveManual}
              disabled={savingManual}
            >
              {savingManual ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PenLine className="mr-1 h-4 w-4" />}
              Enregistrer le défi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
