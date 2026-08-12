"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, PartyPopper, Clapperboard, Send, Sparkles, Heart, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { authFetch } from "@/lib/api-client";
import { signList } from "@/lib/storage";
import { fetchTeamRecipientIds } from "@/lib/playerAlerts";
import { toast } from "sonner";
import type { Newsletter, SeasonStorybook, SeasonGreeting } from "@/types";

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const year = new Date().getFullYear();
  const d = new Date(year, i, 1);
  const label = d.toLocaleDateString("fr-FR", { month: "long" });
  const value = `${year}-${String(i + 1).padStart(2, "0")}`;
  return { value, label };
});

export default function FinSaisonPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [newsletter, setNewsletter] = useState<Newsletter | null>(null);
  const [storybook, setStorybook] = useState<SeasonStorybook | null>(null);
  const [myGreeting, setMyGreeting] = useState<SeasonGreeting | null>(null);
  const [photos, setPhotos] = useState<{ url: string; caption?: string | null }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [storybookOpen, setStorybookOpen] = useState(false);
  const [greetingsOpen, setGreetingsOpen] = useState(false);
  const [preview, setPreview] = useState<{ kind: "newsletter" | "storybook"; data: unknown } | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const season = new Date().getFullYear();
    const seasonLabel = new Date().getMonth() >= 7 ? `${season}-${season + 1}` : `${season - 1}-${season}`;

    const [nlRes, sbRes, grRes, phRes] = await Promise.all([
      supabase.from("newsletters").select("*").eq("team_id", currentTeam!.id).order("created_at", { ascending: false }),
      supabase.from("season_storybooks").select("*").eq("team_id", currentTeam!.id).eq("season", seasonLabel).maybeSingle(),
      supabase.from("season_greetings").select("*").eq("team_id", currentTeam!.id).eq("season", seasonLabel),
      supabase.from("gallery_media").select("url, storage_path, caption").eq("team_id", currentTeam!.id).eq("media_type", "image").limit(60),
    ]);
    return {
      newsletters: (nlRes.data || []) as Newsletter[],
      storybook: (sbRes.data as SeasonStorybook | null) ?? null,
      greetings: (grRes.data || []) as SeasonGreeting[],
      photos: (await signList(supabase, "gallery", (phRes.data || []) as { url: string; storage_path: string | null; caption?: string | null }[], (p) => ({
        path: p.storage_path || p.url,
        urlField: "url",
      }))) as { url: string; caption?: string | null }[],
    };
  }, [currentTeam]);

  useEffect(() => {
    if (!currentTeam) return;
    loadData().then((res) => {
      setNewsletter(res.newsletters[0] ?? null);
      setStorybook(res.storybook);
      setPhotos(res.photos);
      setMyGreeting(res.greetings.find((g) => g.player_id === user?.id) ?? null);
    });
  }, [currentTeam, loadData, user?.id]);

  async function generateNewsletter() {
    setBusy("newsletter");
    try {
      const res = await authFetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam!.id, month }),
      });
      const json = (await res.json()) as { ok?: boolean; content?: Newsletter; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Échec");
      setNewsletterOpen(false);
      setPreview({ kind: "newsletter", data: json.content });
      toast.success("Newsletter générée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function sendNewsletter() {
    setBusy("newsletter-send");
    try {
      const recipients = await fetchTeamRecipientIds(currentTeam!.id);
      if (recipients.length === 0) return;
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: recipients,
          title: `Newsletter ${newsletter?.title || "de l'équipe"}`,
          body: "La newsletter de l'équipe est disponible. Bonne lecture !",
          type: "newsletter",
          reference_id: newsletter?.id ?? undefined,
          team_id: currentTeam!.id,
          url: "/fin-saison",
        }),
      });
      toast.success("Newsletter envoyée aux familles");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function generateStorybook() {
    setBusy("storybook");
    try {
      const res = await authFetch("/api/season/storybook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam!.id }),
      });
      const json = (await res.json()) as { ok?: boolean; content?: SeasonStorybook; pdf?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Échec");
      setStorybookOpen(false);
      setPreview({ kind: "storybook", data: json.content });
      toast.success("Livret de saison généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function generateGreetings() {
    setBusy("greetings");
    try {
      const res = await authFetch("/api/season/greetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam!.id }),
      });
      const json = (await res.json()) as { ok?: boolean; count?: number; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Échec");
      setGreetingsOpen(false);
      toast.success(`${json.count} vœux générés pour la saison`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-[var(--color-gold)]" />
          Fin de saison
        </h1>
        <p className="text-sm text-muted-foreground">Bouclez la saison : diaporama, newsletter, livret souvenir et vœux pour les joueurs.</p>
      </div>

      {/* Diaporama */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-[var(--color-royal)]" />
            Diaporama de saison
          </CardTitle>
          <CardDescription>{photos.length > 0 ? `${photos.length} photos dans la galerie` : "Ajoutez des photos dans la galerie pour lancer un diaporama automatique."}</CardDescription>
        </CardHeader>
        {photos.length > 0 && (
          <CardContent>
            <Slideshow photos={photos} />
          </CardContent>
        )}
      </Card>

      {/* Newsletter */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4 text-[var(--color-royal)]" />
                Newsletter mensuelle
              </CardTitle>
              <CardDescription>Résumé du mois rédigé par IA et envoyé aux familles.</CardDescription>
            </div>
            {isCoach && (
              <Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={() => setNewsletterOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Générer
              </Button>
            )}
          </div>
        </CardHeader>
        {newsletter && (
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3">
              <p className="font-semibold text-sm">{newsletter.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {newsletter.month === "full" ? "Bilan complet" : new Date(`${newsletter.month}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </p>
              {isCoach && (
                <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={sendNewsletter} disabled={busy === "newsletter-send"}>
                  {busy === "newsletter-send" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                  Envoyer aux familles
                </Button>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Livret */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[var(--color-royal)]" />
                Livret de saison PDF
              </CardTitle>
              <CardDescription>Le récit complet de la saison, prêt à imprimer et à distribuer.</CardDescription>
            </div>
            {isCoach && (
              <Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={() => setStorybookOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Générer
              </Button>
            )}
          </div>
        </CardHeader>
        {storybook && (
          <CardContent>
            <div className="rounded-lg border p-3">
              <p className="font-semibold text-sm">{(storybook.content as { title?: string })?.title || "Livret de saison"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Saison {storybook.season}</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Vœux */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Heart className="h-4 w-4 text-[var(--color-royal)]" />
                Vœux de saison
              </CardTitle>
              <CardDescription>Un message de fin de saison personnalisé par joueur, écrit par IA.</CardDescription>
            </div>
            {isCoach && (
              <Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={() => setGreetingsOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Générer
              </Button>
            )}
          </div>
        </CardHeader>
        {myGreeting && (
          <CardContent>
            <div className="rounded-lg border p-3 text-sm">{myGreeting.content}</div>
          </CardContent>
        )}
      </Card>

      {/* Dialog newsletter */}
      <Dialog open={newsletterOpen} onOpenChange={setNewsletterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Newsletter mensuelle</DialogTitle>
            <DialogDescription>Choisissez le mois. L&apos;IA résume résultats, vie du groupe et rendez-vous à venir.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Mois</Label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setNewsletterOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={generateNewsletter} disabled={busy === "newsletter"}>
              {busy === "newsletter" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog livret */}
      <Dialog open={storybookOpen} onOpenChange={setStorybookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Livret de saison</DialogTitle>
            <DialogDescription>Génère le récit complet de la saison en PDF (bilan, chapitres, anecdotes).</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setStorybookOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={generateStorybook} disabled={busy === "storybook"}>
              {busy === "storybook" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Générer le livret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog vœux */}
      <Dialog open={greetingsOpen} onOpenChange={setGreetingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vœux de saison</DialogTitle>
            <DialogDescription>Écrit un message personnalisé pour chaque joueur actif de l&apos;équipe.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setGreetingsOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={generateGreetings} disabled={busy === "greetings"}>
              {busy === "greetings" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Générer les vœux
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aperçu généré */}
      <PreviewDialog preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function Slideshow({ photos }: { photos: { url: string; caption?: string | null }[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || photos.length === 0) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), 4000);
    return () => clearInterval(id);
  }, [playing, photos.length]);

  if (photos.length === 0) return null;
  const photo = photos[index];

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        <img src={photo.url} alt={photo.caption || "Photo de la saison"} className="h-full w-full object-contain" />
        <button type="button" onClick={() => setPlaying((p) => !p)} className="absolute bottom-2 right-2 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
          {playing ? "Pause" : "Lecture"}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setIndex((index - 1 + photos.length) % photos.length)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{index + 1} / {photos.length}{photo.caption ? ` · ${photo.caption}` : ""}</span>
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setIndex((index + 1) % photos.length)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex gap-1">
        {photos.map((_, i) => (
          <button key={i} type="button" onClick={() => setIndex(i)} className={`h-1.5 flex-1 rounded-full ${i === index ? "bg-[var(--color-gold)]" : "bg-muted"}`} />
        ))}
      </div>
    </div>
  );
}

function PreviewDialog({ preview, onClose }: { preview: { kind: string; data: unknown } | null; onClose: () => void }) {
  if (!preview) return null;
  const content = preview.data as {
    title?: string;
    intro?: string;
    sections?: { heading: string; text: string }[];
    chapters?: { heading: string; text: string }[];
    conclusion?: string;
  };
  return (
    <Dialog open={!!preview} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
        </DialogHeader>
        {content.intro && <p className="text-sm text-muted-foreground">{content.intro}</p>}
        {(content.sections || content.chapters || []).map((s, i) => (
          <div key={i} className="rounded-lg border p-3">
            <p className="font-semibold text-sm">{s.heading}</p>
            <p className="text-sm text-muted-foreground mt-1">{s.text}</p>
          </div>
        ))}
        {content.conclusion && <p className="rounded-lg bg-muted p-3 text-sm">{content.conclusion}</p>}
        <DialogFooter>
          <Button size="sm" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
