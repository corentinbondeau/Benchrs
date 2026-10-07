"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Handshake, Plus, Pencil, Trash2, Euro, Upload, Globe } from "lucide-react";
import { toast } from "sonner";
import { signedStorageUrl } from "@/lib/storage";

interface Sponsor {
  id: string;
  name: string;
  sponsor_type: "commercant" | "institutionnel" | "club" | "autre";
  amount: number;
  season: string | null;
  start_date: string | null;
  end_date: string | null;
  website: string | null;
  logo_path: string | null;
  logo_url: string | null;
  sort_order: number;
}

const SPONSOR_TYPES: Record<Sponsor["sponsor_type"], string> = {
  commercant: "Commerçant",
  institutionnel: "Institutionnel",
  club: "Club partenaire",
  autre: "Autre",
};

export default function ClubPartenairesPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [name, setName] = useState("");
  const [sponsorType, setSponsorType] = useState<Sponsor["sponsor_type"]>("commercant");
  const [amount, setAmount] = useState("0");
  const [season, setSeason] = useState("");
  const [website, setWebsite] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (cid: string) => {
    const { data } = await supabaseRef.current
      .from("club_sponsors")
      .select("*")
      .eq("club_id", cid)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    const rows = ((data || []) as Record<string, unknown>[]).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      sponsor_type: (s.sponsor_type as Sponsor["sponsor_type"]) ?? "autre",
      amount: Number(s.amount) || 0,
      season: (s.season as string | null) ?? null,
      start_date: (s.start_date as string | null) ?? null,
      end_date: (s.end_date as string | null) ?? null,
      website: (s.website as string | null) ?? null,
      logo_path: (s.logo_path as string | null) ?? null,
      logo_url: null as string | null,
      sort_order: Number(s.sort_order) || 0,
    }));

    const signed = await Promise.all(
      rows.map(async (s) => ({
        ...s,
        logo_url: s.logo_path
          ? await signedStorageUrl(supabaseRef.current, "club_sponsors", s.logo_path)
          : null,
      }))
    );
    return signed;
  }, []);

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setSponsors(res);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setSponsorType("commercant");
    setAmount("0");
    setSeason("");
    setWebsite("");
    setLogoFile(null);
    setDialogOpen(true);
  }

  function openEdit(s: Sponsor) {
    setEditing(s);
    setName(s.name);
    setSponsorType(s.sponsor_type);
    setAmount(String(s.amount));
    setSeason(s.season ?? "");
    setWebsite(s.website ?? "");
    setLogoFile(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
  }

  async function uploadLogo(clubId: string): Promise<string | null> {
    if (!logoFile) return editing?.logo_path ?? null;
    const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
    const path = `club_sponsors/${clubId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseRef.current.storage.from("club_sponsors").upload(path, logoFile, {
      contentType: logoFile.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      toast.error("Impossible d'uploader le logo");
      return null;
    }
    return path;
  }

  async function removeLogo(path: string) {
    await supabaseRef.current.storage.from("club_sponsors").remove([path]);
  }

  async function saveSponsor() {
    const cleanName = name.trim();
    if (!clubId || !user) return;
    if (!cleanName) {
      toast.error("Le nom du partenaire est requis");
      return;
    }
    setSaving(true);
    try {
      const path = await uploadLogo(clubId);
      if (logoFile && !path) return;

      if (editing) {
        const { error } = await supabaseRef.current
          .from("club_sponsors")
          .update({
            name: cleanName,
            sponsor_type: sponsorType,
            amount: Number(amount) || 0,
            season: season.trim() || null,
            website: website.trim() || null,
            logo_path: path,
          })
          .eq("id", editing.id);
        if (error) {
          toast.error("Erreur lors de l'enregistrement");
        } else {
          if (editing.logo_path && editing.logo_path !== path) await removeLogo(editing.logo_path);
          toast.success("Partenaire mis à jour");
          closeDialog();
          load(clubId).then(setSponsors);
        }
      } else {
        const { data: maxData } = await supabaseRef.current
          .from("club_sponsors")
          .select("sort_order")
          .eq("club_id", clubId)
          .order("sort_order", { ascending: false })
          .limit(1);
        const nextOrder = ((maxData || [])[0] as { sort_order?: number } | undefined)?.sort_order ?? -1;
        const { error } = await supabaseRef.current.from("club_sponsors").insert({
          club_id: clubId,
          name: cleanName,
          sponsor_type: sponsorType,
          amount: Number(amount) || 0,
          season: season.trim() || null,
          website: website.trim() || null,
          logo_path: path,
          sort_order: nextOrder + 1,
          created_by: user.id,
        });
        if (error) {
          toast.error("Erreur lors de la création");
        } else {
          toast.success("Partenaire ajouté");
          closeDialog();
          load(clubId).then(setSponsors);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteSponsor(s: Sponsor) {
    if (!clubId) return;
    const { error } = await supabaseRef.current.from("club_sponsors").delete().eq("id", s.id);
    if (error) {
      toast.error("Impossible de supprimer ce partenaire");
      return;
    }
    if (s.logo_path) await removeLogo(s.logo_path);
    toast.success("Partenaire supprimé");
    load(clubId).then(setSponsors);
  }

  async function moveSponsor(s: Sponsor, dir: -1 | 1) {
    const idx = sponsors.findIndex((x) => x.id === s.id);
    const target = sponsors[idx + dir];
    if (!target) return;
    const { error } = await supabaseRef.current
      .from("club_sponsors")
      .upsert([
        { id: s.id, sort_order: target.sort_order },
        { id: target.id, sort_order: s.sort_order },
      ]);
    if (error) {
      toast.error("Impossible de réordonner");
      return;
    }
    load(clubId).then(setSponsors);
  }

  const totalAmount = sponsors.reduce((acc, s) => acc + (s.season ? s.amount : 0), 0);

  return (
    <ClubPageShell
      title="Partenaires & sponsors"
      subtitle="Les partenaires qui accompagnent le club"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || pageLoading}
      actions={
        isCommittee && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Ajouter un partenaire
          </Button>
        )
      }
    >
      <div className="space-y-6">
        {sponsors.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Handshake className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">
                Aucun partenaire enregistré pour ce club. Le comité peut en ajouter.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {isCommittee && totalAmount > 0 && (
              <Card>
                <CardContent className="flex items-center gap-2 py-3">
                  <Euro className="h-4 w-4 text-[var(--color-royal)]" />
                  <span className="text-sm">
                    Total (partenaires datés) :{" "}
                    <strong>{totalAmount.toFixed(2).replace(".", ",")} €</strong>
                  </span>
                </CardContent>
              </Card>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {sponsors.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      {s.logo_url ? (
                        <img
                          src={s.logo_url}
                          alt={s.name}
                          className="h-12 max-w-28 object-contain rounded-md border bg-white p-1"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-md border flex items-center justify-center text-muted-foreground">
                          <Handshake className="h-5 w-5" />
                        </div>
                      )}
                      {isCommittee && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSponsor(s, -1)} disabled={sponsors[0]?.id === s.id}>
                            ↑
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSponsor(s, 1)} disabled={sponsors[sponsors.length - 1]?.id === s.id}>
                            ↓
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 space-y-1">
                      <p className="font-semibold leading-tight">{s.name}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">{SPONSOR_TYPES[s.sponsor_type]}</Badge>
                        {s.season && <Badge variant="outline">{s.season}</Badge>}
                        {s.amount > 0 && (
                          <Badge variant="outline">{s.amount.toFixed(2).replace(".", ",")} €</Badge>
                        )}
                      </div>
                      {s.website && (
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--color-royal)] flex items-center gap-1 break-all"
                        >
                          <Globe className="h-3 w-3 shrink-0" />
                          {s.website}
                        </a>
                      )}
                    </div>
                    {isCommittee && (
                      <div className="mt-3 flex justify-end gap-1 border-t pt-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSponsor(s)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => (o ? closeDialog() : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le partenaire" : "Ajouter un partenaire"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Boulangerie du Stade" />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={sponsorType} onValueChange={(v) => setSponsorType(v as Sponsor["sponsor_type"])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SPONSOR_TYPES) as Sponsor["sponsor_type"][]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {SPONSOR_TYPES[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Montant (€)</Label>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Saison</Label>
                <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Ex. : 2026-2027" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Site web (optionnel)</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1">
              <Label>Logo (optionnel)</Label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm cursor-pointer">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {logoFile ? logoFile.name : editing?.logo_path ? "Remplacer le logo" : "Choisir un fichier"}
                </span>
                <Input type="file" accept="image/*" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={closeDialog}>
                Annuler
              </Button>
              <Button onClick={saveSponsor} disabled={saving}>
                {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ClubPageShell>
  );
}