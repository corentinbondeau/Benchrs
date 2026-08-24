"use client";

import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

interface LogoBannerSectionProps {
  isCoach: boolean;
}

export default function LogoBannerSection({ isCoach }: LogoBannerSectionProps) {
  const { currentTeam, refreshTeams } = useTeam();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  async function uploadBranding(file: File, kind: "logo" | "banner") {
    if (!currentTeam) return;
    const supabase = createClient();
    if (kind === "logo") setUploadingLogo(true);
    else setUploadingBanner(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${currentTeam.id}/${kind}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("team_branding")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("team_branding").getPublicUrl(path);
      const url = urlData.publicUrl;

      const column = kind === "logo" ? "logo_url" : "banner_url";
      const { error: updateError } = await supabase
        .from("teams")
        .update({ [column]: url })
        .eq("id", currentTeam.id);
      if (updateError) throw updateError;

      await refreshTeams();
      toast.success(kind === "logo" ? "Logo mis à jour !" : "Bannière mise à jour !");
    } catch (e) {
      console.error("[branding] upload error:", e);
      toast.error("Erreur lors de l'upload");
    } finally {
      if (kind === "logo") setUploadingLogo(false);
      else setUploadingBanner(false);
    }
  }

  async function deleteBranding(kind: "logo" | "banner") {
    if (!currentTeam) return;
    const supabase = createClient();
    const column = kind === "logo" ? "logo_url" : "banner_url";
    const { error } = await supabase.from("teams").update({ [column]: null }).eq("id", currentTeam.id);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    await refreshTeams();
    toast.success(kind === "logo" ? "Logo supprimé" : "Bannière supprimée");
  }

  if (!isCoach || !currentTeam) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo & bannière</CardTitle>
        <CardDescription>
          Personnalisez l&apos;identité visuelle de l&apos;équipe (PNG, JPG, WebP, SVG — 5 Mo max).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Logo</Label>
          {currentTeam.logo_url ? (
            <div className="flex items-center gap-3">
              <img
                src={currentTeam.logo_url}
                alt="Logo de l'équipe"
                className="h-16 w-16 rounded-xl object-cover border"
              />
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploadingLogo}
                  onClick={() => document.getElementById("logo-upload")?.click()}
                >
                  {uploadingLogo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                  Remplacer
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteBranding("logo")}>
                  <Trash2 className="mr-1 h-4 w-4" /> Supprimer
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              disabled={uploadingLogo}
              onClick={() => document.getElementById("logo-upload")?.click()}
            >
              {uploadingLogo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
              Téléverser un logo
            </Button>
          )}
          <input
            id="logo-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBranding(file, "logo");
              e.target.value = "";
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>Bannière</Label>
          {currentTeam.banner_url ? (
            <div className="space-y-2">
              <img
                src={currentTeam.banner_url}
                alt="Bannière de l'équipe"
                className="h-24 w-full rounded-xl object-cover border"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={uploadingBanner}
                  onClick={() => document.getElementById("banner-upload")?.click()}
                >
                  {uploadingBanner ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                  Remplacer
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteBranding("banner")}>
                  <Trash2 className="mr-1 h-4 w-4" /> Supprimer
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              disabled={uploadingBanner}
              onClick={() => document.getElementById("banner-upload")?.click()}
            >
              {uploadingBanner ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
              Téléverser une bannière
            </Button>
          )}
          <input
            id="banner-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBranding(file, "banner");
              e.target.value = "";
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
