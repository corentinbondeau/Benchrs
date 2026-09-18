"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Loader2, Check, Trash2 } from "lucide-react";

export interface PoolTeam {
  cl_no: number;
  number: number;
  team_name: string;
}

export interface PouleMatch {
  id: string;
  matchday: number | null;
  home_team: string;
  away_team: string;
  home_cl_no: number | null;
  home_team_number: number | null;
  away_cl_no: number | null;
  away_team_number: number | null;
  home_score: number | null;
  away_score: number | null;
  kickoff: string | null;
  location: string | null;
  postponed: boolean;
  home_is_forfeit: boolean;
  away_is_forfeit: boolean;
  source: string;
  dofa_ma_no: number | null;
}

interface PouleResultsCardProps {
  championshipId: string;
  teams: PoolTeam[];
  matches: PouleMatch[];
  isCoach: boolean;
  /** Recharge les championnats (classement recalculé côté serveur). */
  onChanged: () => Promise<void> | void;
}

/** "2026-09-06T13:00:00.000Z" → "06/09 à 13:00" (heure locale si présente). */
function fmtKickoff(kickoff: string | null): string {
  if (!kickoff) return "";
  const date = kickoff.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const label = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const time = kickoff.slice(11, 16);
  return time && time !== "00:00" ? `${label} à ${time}` : label;
}

function teamKey(t: PoolTeam): string {
  return `${t.cl_no}/${t.number}`;
}

interface ScoreDraft {
  h: string;
  a: string;
  np: boolean;
}

const EMPTY_DRAFT: ScoreDraft = { h: "", a: "", np: false };

export default function PouleResultsCard({
  championshipId,
  teams,
  matches,
  isCoach,
  onChanged,
}: PouleResultsCardProps) {
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Dialog d'ajout manuel.
  const [addOpen, setAddOpen] = useState(false);
  const [addHomeKey, setAddHomeKey] = useState("");
  const [addAwayKey, setAddAwayKey] = useState("");
  const [addH, setAddH] = useState("");
  const [addA, setAddA] = useState("");
  const [addNp, setAddNp] = useState(false);
  const [addMatchday, setAddMatchday] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const draftOf = (m: PouleMatch): ScoreDraft =>
    drafts[m.id] ?? {
      h: m.home_score != null ? String(m.home_score) : "",
      a: m.away_score != null ? String(m.away_score) : "",
      np: m.home_score == null && m.away_score == null,
    };

  const clearDraft = (id: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const updateDraft = (id: string, patch: Partial<ScoreDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...draftOf2(prev, id), ...patch } }));

  // `draftOf` lit les props (matches), introuvable depuis le setter précédent :
  // on reconstruit le brouillon courant depuis l'état ET le match correspondant.
  function draftOf2(prev: Record<string, ScoreDraft>, id: string): ScoreDraft {
    if (prev[id]) return prev[id];
    const m = matches.find((x) => x.id === id);
    if (!m) return EMPTY_DRAFT;
    return {
      h: m.home_score != null ? String(m.home_score) : "",
      a: m.away_score != null ? String(m.away_score) : "",
      np: m.home_score == null && m.away_score == null,
    };
  }

  function parseScore(prev: ScoreDraft, side: "h" | "a"): number | null {
    if (prev.np) return null;
    const raw = prev[side === "h" ? "h" : "a"];
    const value = Number(raw);
    if (raw === "" || !Number.isInteger(value) || value < 0) return null;
    return value;
  }

  async function saveMatch(m: PouleMatch) {
    const draft = draftOf(m);
    const homeScore = parseScore(draft, "h");
    const awayScore = parseScore(draft, "a");
    if (draft.np) {
      // ok : null / null
    } else if (homeScore === null || awayScore === null) {
      toast.error("Saisissez deux scores entiers (ou cochez « Non joué »).");
      return;
    }

    setBusyId(m.id);
    try {
      const res = await authFetch("/api/championships/standings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: m.id,
          championship_id: championshipId,
          home_score: draft.np ? null : homeScore,
          away_score: draft.np ? null : awayScore,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de l'enregistrement du score.");
        return;
      }
      clearDraft(m.id);
      toast.success("Score enregistré.");
      await onChanged();
    } catch {
      toast.error("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMatch(m: PouleMatch) {
    if (!window.confirm(`Supprimer le match ${m.home_team} - ${m.away_team} ?`)) return;
    setBusyId(m.id);
    try {
      const res = await authFetch("/api/championships/standings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, championship_id: championshipId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la suppression.");
        return;
      }
      clearDraft(m.id);
      toast.success("Match supprimé.");
      await onChanged();
    } catch {
      toast.error("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setBusyId(null);
    }
  }

  function resetAdd() {
    setAddHomeKey("");
    setAddAwayKey("");
    setAddH("");
    setAddA("");
    setAddNp(false);
    setAddMatchday("");
    setAddSaving(false);
  }

  function teamByKey(key: string): PoolTeam | undefined {
    return teams.find((t) => teamKey(t) === key);
  }

  async function submitAdd() {
    if (!addHomeKey || !addAwayKey) {
      toast.error("Choisissez les deux équipes.");
      return;
    }
    if (addHomeKey === addAwayKey) {
      toast.error("Les deux équipes doivent être différentes.");
      return;
    }
    const home = teamByKey(addHomeKey);
    const away = teamByKey(addAwayKey);
    if (!home || !away) return;

    let hScore: number | null = null;
    let aScore: number | null = null;
    if (!addNp) {
      hScore = Number(addH);
      aScore = Number(addA);
      if (
        !Number.isInteger(hScore) ||
        !Number.isInteger(aScore) ||
        hScore < 0 ||
        aScore < 0
      ) {
        toast.error("Saisissez deux scores entiers (ou cochez « Non joué »).");
        return;
      }
    }

    setAddSaving(true);
    try {
      const res = await authFetch("/api/championships/standings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championship_id: championshipId,
          home_team: home.team_name,
          away_team: away.team_name,
          home_cl_no: home.cl_no,
          home_team_number: home.number,
          away_cl_no: away.cl_no,
          away_team_number: away.number,
          home_score: hScore,
          away_score: aScore,
          matchday_number: addMatchday.trim() ? Number(addMatchday) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de l'ajout du résultat.");
        return;
      }
      toast.success("Résultat ajouté.");
      setAddOpen(false);
      resetAdd();
      await onChanged();
    } catch {
      toast.error("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setAddSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            Résultats de la poule
            <Badge variant="outline" className="text-xs">
              {matches.length}
            </Badge>
          </CardTitle>
          {isCoach && (
            <Dialog
              open={addOpen}
              onOpenChange={(open) => {
                setAddOpen(open);
                if (!open) resetAdd();
              }}
            >
              <DialogTrigger render={<Button variant="primary" size="sm" />}>
                <Plus className="h-4 w-4 mr-1" />
                Ajouter un résultat
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Ajouter un résultat de poule</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Renseignez le score des matchs des autres équipes de la poule : le
                    classement ci-dessus est recalculé automatiquement.
                  </p>
                  <div className="space-y-2">
                    <Label>Équipe domicile</Label>
                    <Select value={addHomeKey} onValueChange={(v) => setAddHomeKey(v ?? "")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir une équipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => (
                          <SelectItem key={teamKey(t)} value={teamKey(t)}>
                            {t.team_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Équipe extérieure</Label>
                    <Select value={addAwayKey} onValueChange={(v) => setAddAwayKey(v ?? "")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir une équipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams
                          .filter((t) => teamKey(t) !== addHomeKey)
                          .map((t) => (
                            <SelectItem key={teamKey(t)} value={teamKey(t)}>
                              {t.team_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Score domicile</Label>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        disabled={addNp}
                        value={addH}
                        onChange={(e) => setAddH(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Score extérieur</Label>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        disabled={addNp}
                        value={addA}
                        onChange={(e) => setAddA(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-np"
                      checked={addNp}
                      onCheckedChange={(v) => setAddNp(v === true)}
                    />
                    <Label htmlFor="add-np" className="font-normal text-sm">
                      Match non joué (reporté / à venir)
                    </Label>
                  </div>
                  <div className="space-y-2">
                    <Label>Journée (optionnel)</Label>
                    <Input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="Ex : 7"
                      value={addMatchday}
                      onChange={(e) => setAddMatchday(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={submitAdd}
                    disabled={addSaving}
                    className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
                  >
                    {addSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enregistrement...
                      </>
                    ) : (
                      "Ajouter"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {matches.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            {isCoach
              ? "Aucun résultat en base. Ajoutez les scores des autres matchs de la poule pour tenir le classement à jour."
              : "Aucun résultat enregistré pour le moment."}
          </p>
        ) : (
          <div className="divide-y">
            {matches.map((m) => {
              const draft = draftOf(m);
              const busy = busyId === m.id;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="w-16 shrink-0 text-xs text-muted-foreground leading-tight">
                    {m.matchday != null && <div>J{m.matchday}</div>}
                    {fmtKickoff(m.kickoff) && <div>{fmtKickoff(m.kickoff)}</div>}
                  </div>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="truncate font-medium">{m.home_team}</p>
                    <p className="truncate text-muted-foreground">{m.away_team}</p>
                  </div>
                  {isCoach ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input
                        className="w-11 h-8 text-center"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        disabled={draft.np || busy}
                        value={draft.h}
                        onChange={(e) => updateDraft(m.id, { h: e.target.value })}
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input
                        className="w-11 h-8 text-center"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        disabled={draft.np || busy}
                        value={draft.a}
                        onChange={(e) => updateDraft(m.id, { a: e.target.value })}
                      />
                      <div
                        className="flex items-center gap-1 pl-1 cursor-pointer"
                        title="Match non joué"
                        onClick={() => updateDraft(m.id, { np: !draft.np })}
                      >
                        <Checkbox checked={draft.np} onCheckedChange={() => undefined} />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Enregistrer le score"
                        onClick={() => saveMatch(m)}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {m.source === "manual" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Supprimer"
                          className="text-destructive"
                          onClick={() => removeMatch(m)}
                          disabled={busy}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-right font-semibold whitespace-nowrap shrink-0">
                      {m.home_score != null && m.away_score != null ? (
                        `${m.home_score} - ${m.away_score}`
                      ) : (
                        <Badge variant="outline">
                          {m.postponed
                            ? "Reporté"
                            : m.home_is_forfeit || m.away_is_forfeit
                              ? "Forfait"
                              : "Non joué"}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}