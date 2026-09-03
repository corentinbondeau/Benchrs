"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchTeamActivePlayers } from "@/lib/players";
import { signList, signedStorageUrl } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dumbbell,
  Gauge,
  Upload,
  Plus,
  FileText,
  Check,
  X,
  Clock,
  AlertCircle,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile, PhysicalPrepDocument, PhysicalPrepSession, PhysicalPrepStatus } from "@/types";

const VMA_PERCENTAGES = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

function vmaToPace(vma: number, percentage: number): string {
  const speed = vma * (percentage / 100);
  if (speed <= 0) return "—";
  const paceMinPerKm = 60 / speed;
  const min = Math.floor(paceMinPerKm);
  const sec = Math.round((paceMinPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const STATUS_OPTIONS = [
  { value: "success", label: "Réussi", icon: "🟢" },
  { value: "partial", label: "Fait mais objectif non atteint", icon: "🟡" },
  { value: "failed", label: "Non fait", icon: "🔴" },
  { value: "excused", label: "Excusé", icon: "⚪" },
] as const;

export default function PhysicalPreparationPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [players, setPlayers] = useState<Profile[]>([]);
  const [documents, setDocuments] = useState<PhysicalPrepDocument[]>([]);
  const [sessions, setSessions] = useState<PhysicalPrepSession[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, PhysicalPrepStatus[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"vma" | "docs" | "tracking">("vma");

  const [docUploadOpen, setDocUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);

  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionNotes, setSessionNotes] = useState("");

  const supabaseRef = useRef(createClient());

  const fetchData = useCallback(async () => {
    if (!currentTeam) return;
    const [playersRes, docsRes, sessionsRes] = await Promise.all([
      fetchTeamActivePlayers(currentTeam.id),
      supabaseRef.current
        .from("physical_prep_documents")
        .select("*")
        .eq("team_id", currentTeam.id)
        .order("created_at", { ascending: false }),
      supabaseRef.current
        .from("physical_prep_sessions")
        .select("*")
        .eq("team_id", currentTeam.id)
        .order("session_date", { ascending: false }),
    ]);

    setPlayers(playersRes.sort((a, b) => (a.last_name || "").localeCompare(b.last_name || "")));
    const docs = (docsRes.data as PhysicalPrepDocument[]) || [];
    const signedDocs = await signList(supabaseRef.current, "physical_docs", docs, (d) => ({
      path: d.storage_path || d.file_url,
      urlField: "file_url",
    }));
    setDocuments(signedDocs);
    setSessions((sessionsRes.data as PhysicalPrepSession[]) || []);

    if (sessionsRes.data) {
      const sessionIds = (sessionsRes.data as PhysicalPrepSession[]).map((s) => s.id);
      if (sessionIds.length > 0) {
        const { data: statusData } = await supabaseRef.current
          .from("physical_prep_status")
          .select("*")
          .in("session_id", sessionIds);
        const map: Record<string, PhysicalPrepStatus[]> = {};
        for (const s of statusData || []) {
          const sId = (s as PhysicalPrepStatus).session_id;
          if (!map[sId]) map[sId] = [];
          map[sId].push(s as PhysicalPrepStatus);
        }
        setStatusMap(map);
      }
    }
    setLoading(false);
  }, [currentTeam?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleUploadDoc() {
    if (!docTitle.trim() || !docFile || !currentTeam) return;
    setDocUploading(true);
    const supabase = createClient();
    const ext = docFile.name.split(".").pop();
    const path = `${currentTeam.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = await docFile.arrayBuffer();
    const contentType = docFile.type || "application/pdf";
    const { error: uploadError } = await supabase.storage
      .from("physical_docs")
      .upload(path, buffer, { upsert: true, contentType });
    if (uploadError) { toast.error(`Upload échoué: ${uploadError.message}`); setDocUploading(false); return; }
    const { data: inserted, error: insertError } = await supabase.from("physical_prep_documents").insert({
      team_id: currentTeam.id,
      title: docTitle.trim(),
      file_url: path,
      storage_path: path,
      uploaded_by: user?.id,
    }).select().single();
    if (insertError) { toast.error(insertError.message); setDocUploading(false); return; }
    const signed = await signedStorageUrl(supabase, "physical_docs", path);
    if (inserted) setDocuments(prev => [{ ...(inserted as PhysicalPrepDocument), file_url: signed || (inserted as PhysicalPrepDocument).file_url }, ...prev]);
    toast.success("Document ajouté");
    setDocUploadOpen(false);
    setDocTitle("");
    setDocFile(null);
    setDocUploading(false);
  }

  async function handleCreateSession() {
    if (!sessionTitle.trim() || !currentTeam) return;
    const { data, error } = await supabaseRef.current.from("physical_prep_sessions").insert({
      team_id: currentTeam.id,
      title: sessionTitle.trim(),
      session_date: sessionDate,
      notes: sessionNotes || null,
      created_by: user?.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    if (data) setSessions(prev => [data as PhysicalPrepSession, ...prev]);
    setSessionOpen(false);
    setSessionTitle("");
    setSessionDate(new Date().toISOString().slice(0, 10));
    setSessionNotes("");
    toast.success("Séance créée");
  }

  async function updatePlayerStatus(sessionId: string, playerId: string, status: string) {
    const existing = statusMap[sessionId]?.find((s) => s.player_id === playerId);
    if (existing) {
      await supabaseRef.current.from("physical_prep_status").update({ status }).eq("id", existing.id);
      setStatusMap(prev => {
        const next = { ...prev };
        const arr = (next[sessionId] || []).map(s => s.id === existing.id ? { ...s, status: status as "success" | "partial" | "failed" | "excused" | "pending" } : s);
        next[sessionId] = arr;
        return next;
      });
    } else {
      const { data: inserted } = await supabaseRef.current.from("physical_prep_status").insert({
        session_id: sessionId, player_id: playerId, status, team_id: currentTeam!.id,
      }).select().single();
      if (inserted) setStatusMap(prev => ({ ...prev, [sessionId]: [...(prev[sessionId] || []), inserted as PhysicalPrepStatus] }));
    }
  }

  async function deleteDoc(id: string) {
    await supabaseRef.current.from("physical_prep_documents").delete().eq("id", id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    toast.success("Document supprimé");
  }

  async function deleteSession(id: string) {
    await supabaseRef.current.from("physical_prep_sessions").delete().eq("id", id);
    setSessions(prev => prev.filter(s => s.id !== id));
    setStatusMap(prev => { const n = { ...prev }; delete n[id]; return n; });
    toast.success("Séance supprimée");
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  const playersWithVma = players.filter((p) => p.vma != null);
  const activePlayers = players.filter((p) => p.is_active);

  return (
    <div className="section-gap">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Préparation Physique</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivi VMA, documents et tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => router.push("/physical/tests")}
          >
            <Gauge className="h-4 w-4 mr-1" />
            Tests VMA/VMI
          </Button>
          {isCoach && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => router.push("/stats/drop")}
            >
              <AlertCircle className="h-4 w-4 mr-1" />
              Baisse de forme
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30">
        <button
          type="button"
          className={`flex-1 px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === "vma" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("vma")}
        >
          <Gauge className="h-3.5 w-3.5 inline mr-1" />
          Tableau VMA
        </button>
        <button
          type="button"
          className={`flex-1 px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === "docs" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setTab("docs")}
        >
          <FileText className="h-3.5 w-3.5 inline mr-1" />
          Documents
        </button>
        {isCoach && (
          <button
            type="button"
            className={`flex-1 px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === "tracking" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab("tracking")}
          >
            <UserCheck className="h-3.5 w-3.5 inline mr-1" />
            Suivi individuel
          </button>
        )}
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          {/* VMA Conversion Table */}
          {tab === "vma" && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Tableau de conversion VMA — Allures (min/km)</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {playersWithVma.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Aucun joueur n&apos;a de VMA renseignée. Les coachs peuvent ajouter la VMA depuis les fiches joueurs.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-background">Joueur</TableHead>
                          <TableHead className="text-right">VMA</TableHead>
                          {VMA_PERCENTAGES.map((pct) => (
                            <TableHead key={pct} className="text-right">{pct}%</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {playersWithVma.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="sticky left-0 bg-background font-medium">
                              {p.first_name} {p.last_name}
                            </TableCell>
                            <TableCell className="text-right font-bold">{p.vma!.toFixed(1)}</TableCell>
                            {VMA_PERCENTAGES.map((pct) => (
                              <TableCell key={pct} className="text-right text-sm">{vmaToPace(p.vma!, pct)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Documents */}
          {tab === "docs" && (
            <div className="space-y-4">
              {isCoach && (
                <Button onClick={() => setDocUploadOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" />
                  Ajouter un document
                </Button>
              )}
              {documents.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p>Aucun document</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <Card key={doc.id}>
                      <button type="button" className="cursor-pointer w-full text-left" onClick={() => setPreviewDoc(previewDoc === doc.id ? null : doc.id)}>
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="h-5 w-5 text-[var(--color-royal)] shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{doc.title}</p>
                              {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a href={`${doc.file_url}?download=${encodeURIComponent(doc.title)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="outline">Télécharger</Button>
                            </a>
                            {isCoach && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id); }}>
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </button>
                      {previewDoc === doc.id && (
                        <div className="px-4 pb-4">
                          <iframe
                            src={doc.file_url}
                            className="hidden md:block w-full rounded-lg border"
                            style={{ height: "80vh" }}
                            title={doc.title}
                          />
                          <iframe
                            src={`https://docs.google.com/viewer?url=${encodeURIComponent(doc.file_url)}&embedded=true`}
                            className="md:hidden w-full rounded-lg border"
                            style={{ height: "60vh" }}
                            title={doc.title}
                          />
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Individual Tracking (Coaches only) */}
          {tab === "tracking" && isCoach && (
            <div className="space-y-4">
              <Button onClick={() => setSessionOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Ajouter une journée
              </Button>

              {sessions.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Dumbbell className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p>Aucune séance de suivi</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Joueur</TableHead>
                        {[...sessions].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime()).map((s) => (
                          <TableHead key={s.id} className="text-center min-w-[100px]">
                            <div className="flex items-center justify-center gap-1">
                              <span>{s.title}</span>
                              <button
                                type="button"
                                className="text-destructive hover:text-destructive/80"
                                onClick={() => deleteSession(s.id)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activePlayers.map((player) => (
                        <TableRow key={player.id}>
                          <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">
                            {player.first_name} {player.last_name}
                          </TableCell>
                          {[...sessions].sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime()).map((s) => {
                            const ps = (statusMap[s.id] || []).find((st) => st.player_id === player.id);
                            const currentStatus = ps?.status || "pending";
                            return (
                              <TableCell key={s.id} className="p-1">
                                <div className="flex justify-center gap-0.5">
                                  {STATUS_OPTIONS.map((opt) => (
                                    <button
                                      key={opt.value}
                                      className={`px-1.5 py-1 rounded text-xs border transition-all ${currentStatus === opt.value ? "bg-[var(--color-royal)] text-white border-[var(--color-royal)]" : "hover:border-blue-200"}`}
                                      onClick={() => updatePlayerStatus(s.id, player.id, opt.value)}
                                      title={opt.label}
                                    >
                                      {opt.icon}
                                    </button>
                                  ))}
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Upload Document Dialog */}
      <Dialog open={docUploadOpen} onOpenChange={setDocUploadOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Ajouter un document</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titre *</Label>
              <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Planification VMA" />
            </div>
            <div className="space-y-2">
              <Label>Fichier PDF *</Label>
              <Input type="file" accept=".pdf" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocUploadOpen(false)}>Annuler</Button>
            <Button onClick={handleUploadDoc} disabled={!docTitle.trim() || !docFile || docUploading}>{docUploading ? "Upload..." : "Ajouter"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Session Dialog */}
      <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Ajouter une journée</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titre *</Label>
              <Input value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="Séance VMA J1" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSessionOpen(false)}>Annuler</Button>
            <Button onClick={handleCreateSession} disabled={!sessionTitle.trim()}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
