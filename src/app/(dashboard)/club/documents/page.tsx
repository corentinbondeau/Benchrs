"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FolderOpen,
  Upload,
  Trash2,
  Download,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { signedStorageUrl } from "@/lib/storage";

export const DOCUMENT_CATEGORIES = [
  { value: "reglement", label: "Règlement" },
  { value: "pv", label: "PV d'AG / réunion" },
  { value: "budget", label: "Budget" },
  { value: "compte_rendu", label: "Compte-rendu" },
  { value: "actualite", label: "Actualité" },
  { value: "autre", label: "Autre" },
] as const;

interface ClubDocument {
  id: string;
  category: string;
  title: string;
  description: string | null;
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "table";
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") return "image";
  return "doc";
}

export default function ClubDocumentsPage() {
  const { user } = useAuth();
  const { clubs, loading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [docs, setDocs] = useState<ClubDocument[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("autre");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const supabaseRef = useRef(createClient());
  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const load = useCallback(async (cid: string) => {
    const { data } = await supabaseRef.current
      .from("club_documents")
      .select("*")
      .eq("club_id", cid)
      .order("created_at", { ascending: false });
    const rows = (data || []) as Record<string, unknown>[];
    const urls = await Promise.all(
      rows.map(async (r) => ({
        id: r.id as string,
        category: r.category as string,
        title: r.title as string,
        description: (r.description as string | null) ?? null,
        storage_path: r.storage_path as string,
        file_name: r.file_name as string,
        size_bytes: (r.size_bytes as number | null) ?? null,
        created_at: r.created_at as string,
        url: await signedStorageUrl(supabaseRef.current, "club_documents", r.storage_path as string),
      }))
    );
    return urls;
  }, []);

  useEffect(() => {
    if (!clubId) return;
    authFetch("/api/storage/club-documents-bucket", { method: "POST" }).catch(() => null);
    load(clubId).then((rows) => {
      setDocs(rows);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
  }

  async function uploadDoc() {
    if (!clubId || !file || !title.trim()) {
      toast.error("Titre et fichier requis");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `club_documents/${clubId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabaseRef.current.storage
        .from("club_documents")
        .upload(path, file, { upsert: false });
      if (upErr) {
        toast.error(`Upload impossible : ${upErr.message}`);
        return;
      }
      const { error: insErr } = await supabaseRef.current.from("club_documents").insert({
        club_id: clubId,
        category,
        title: title.trim(),
        description: description.trim() || null,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user!.id,
      });
      if (insErr) {
        await supabaseRef.current.storage.from("club_documents").remove([path]);
        toast.error(`Erreur : ${insErr.message}`);
        return;
      }
      setUploadOpen(false);
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      if (clubId) load(clubId).then(setDocs);
      toast.success("Document déposé");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(doc: ClubDocument) {
    if (!clubId) return;
    const { error: dbErr } = await supabaseRef.current
      .from("club_documents")
      .delete()
      .eq("id", doc.id)
      .eq("club_id", clubId);
    if (dbErr) {
      toast.error(dbErr.message);
      return;
    }
    await supabaseRef.current.storage.from("club_documents").remove([doc.storage_path]);
    if (clubId) load(clubId).then(setDocs);
  }

  const catLabel = (c: string) =>
    DOCUMENT_CATEGORIES.find((x) => x.value === c)?.label ?? c;

  return (
    <ClubPageShell
      title="Documents & PV"
      subtitle="Pièces administratives du club (comité)"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={loading || (clubId ? pageLoading : false)}
      comiteOnly
      actions={
        isCommittee ? (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              Déposer un document
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-[var(--color-royal)]" />
                  Déposer un document
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="doc-title">Titre</Label>
                  <Input
                    id="doc-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="PV de l'assemblée générale…"
                    maxLength={200}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Catégorie</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v ?? "autre")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-file">Fichier</Label>
                    <Input
                      id="doc-file"
                      type="file"
                      ref={fileRef}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doc-desc">Description (optionnel)</Label>
                  <Textarea
                    id="doc-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Contexte, décisions principales…"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setUploadOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={uploadDoc} disabled={uploading || !file || !title.trim()}>
                    {uploading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Déposer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      {docs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucun document déposé.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {docs.map((doc) => {
            const icon = fileIcon(doc.file_name);
            return (
              <Card key={doc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                      {icon === "image" && <ImageIcon className="h-5 w-5" />}
                      {icon === "table" && <FileSpreadsheet className="h-5 w-5" />}
                      {icon === "doc" && <FileText className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{doc.title}</p>
                        {isCommittee && (
                          <button
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => deleteDoc(doc)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.file_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <Badge variant="secondary">{catLabel(doc.category)}</Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {doc.size_bytes
                            ? (doc.size_bytes / 1024 / 1024).toFixed(1) + " Mo"
                            : ""}
                        </span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                          {doc.description}
                        </p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        disabled={!doc.url}
                        onClick={() => doc.url && window.open(doc.url, "_blank")}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Ouvrir
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </ClubPageShell>
  );
}