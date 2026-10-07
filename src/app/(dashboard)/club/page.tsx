"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  CalendarDays,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Globe,
  ExternalLink,
  Copy,
  Loader2,
  Mail,
  Phone,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ActivityLogCard } from "@/components/club/ActivityLogCard";
import { ClubAnnounceDialog } from "@/components/club/ClubAnnounceDialog";
import type { TrialRequest } from "@/types";
import { currentSeasonLabel } from "@/lib/goals";
import { Wallet, FileText as FileTextIcon, Clock } from "lucide-react";

interface ClubRow {
  club_id: string;
  role: "comite";
  club:
    | {
        id: string;
        name: string;
        logo_url: string | null;
      }
    | {
        id: string;
        name: string;
        logo_url: string | null;
      }[]
    | null;
}

function firstClub(
  row: { id: string; name: string; logo_url: string | null } | { id: string; name: string; logo_url: string | null }[] | null | undefined
): { id: string; name: string; logo_url: string | null } | undefined {
  if (Array.isArray(row)) return row[0];
  return row ?? undefined;
}

interface CommitteeMember {
  user_id: string;
  role: "comite";
  profile?: {
    first_name: string | null;
    last_name: string | null;
  };
}

interface MatchInfo {
  id: string;
  title: string;
  event_date: string;
  status: "upcoming" | "ongoing" | "completed" | "cancelled";
  opponent: string | null;
  score_us: number | null;
  score_them: number | null;
  match_result: "win" | "loss" | "draw" | null;
}

interface ClubTeam {
  id: string;
  name: string;
  color_primary: string | null;
  color_secondary: string | null;
  nextMatch: MatchInfo | null;
  results: MatchInfo[];
}

interface ClubFinance {
  playerCount: number;
  licenses: { total: number; valid: number; pending: number; expired: number };
  cotisations: { expected: number; paid: number };
  treasury: { income: number; expense: number };
  txCount: number;
  overdue: number;
}

interface ClubAgendaEvent {
  id: string;
  type: "match" | "training";
  title: string;
  event_date: string;
  team_id: string;
  team_name: string;
  location: string | null;
  opponent: string | null;
  status: "upcoming" | "ongoing" | "completed" | "cancelled";
}

interface ClubData {
  id: string;
  name: string;
  logo_url: string | null;
  myRole: "comite";
  teams: ClubTeam[];
  members: CommitteeMember[];
  finance: ClubFinance;
  agenda: ClubAgendaEvent[];
  is_public: boolean;
  public_slug: string | null;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

function formatMatchDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" });
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  if (diffDays === 0) return `Aujourd'hui · ${date}`;
  if (diffDays === 1) return `Demain · ${date}`;
  return `${weekday} ${date}`;
}

function ResultDot({ match }: { match: MatchInfo }) {
  const hasScore = match.score_us !== null && match.score_them !== null;
  const win = match.match_result === "win";
  const loss = match.match_result === "loss";
  const tone = win
    ? "bg-emerald-500 text-white"
    : loss
      ? "bg-red-500 text-white"
      : "bg-muted text-muted-foreground";
  return (
    <span
      title={match.opponent || match.title}
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold ${tone}`}
    >
      {hasScore ? `${match.score_us}-${match.score_them}` : win ? "V" : loss ? "D" : "N"}
    </span>
  );
}

function TeamCard({
  team,
  onOpen,
}: {
  team: ClubTeam;
  onOpen: (href: string) => void;
}) {
  const color = team.color_primary || "#EAB308";
  const result = team.results[team.results.length - 1];
  const FormIcon = result
    ? result.match_result === "win"
      ? TrendingUp
      : result.match_result === "loss"
        ? TrendingDown
        : Minus
    : null;
  const formTone = result
    ? result.match_result === "win"
      ? "text-emerald-600"
      : result.match_result === "loss"
        ? "text-red-600"
        : "text-muted-foreground"
    : "";

  const actions: { href: string; label: string; icon: typeof CalendarDays }[] = [
    { href: "/calendar", label: "Calendrier", icon: CalendarDays },
    { href: "/roster", label: "Effectif", icon: Users },
    { href: "/stats", label: "Stats", icon: BarChart3 },
  ];

  return (
    <div className="group relative flex flex-col gap-2.5 rounded-xl border p-3.5 text-left hover:border-foreground/20 hover:shadow-sm transition-all">
      <span
        className="absolute inset-x-0 top-0 h-1 rounded-t-xl"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold truncate">{team.name}</span>
        </span>
        {FormIcon && <FormIcon className={`h-4 w-4 shrink-0 ${formTone}`} />}
      </div>

      <div className="space-y-1">
        {team.nextMatch ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0 font-medium text-foreground">
              {formatMatchDay(team.nextMatch.event_date)}
            </span>
            <span className="truncate">
              {team.nextMatch.opponent || team.nextMatch.title}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            Aucun prochain match
          </div>
        )}

        <div className="flex items-center gap-2">
          {team.results.length > 0 ? (
            <>
              <Trophy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex items-center gap-1">
                {team.results.map((r) => (
                  <ResultDot key={r.id} match={r} />
                ))}
              </span>
              <span className="text-[11px] text-muted-foreground">
                derniers matchs
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Aucun résultat
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-0.5">
        {actions.map((action) => (
          <button
            key={action.href}
            type="button"
            onClick={() => onOpen(action.href)}
            className="flex items-center justify-center gap-1 rounded-lg border bg-background px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/25 transition-colors"
          >
            <action.icon className="h-3.5 w-3.5 shrink-0" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Pilotage & finances du club ─── */
function ClubFinanceStrip({ finance }: { finance: ClubFinance }) {
  const remaining = Math.max(0, finance.cotisations.expected - finance.cotisations.paid);
  const collected = finance.cotisations.paid + finance.treasury.income;
  const balance = collected - finance.treasury.expense;

  const cards: { label: string; value: string; sub: string; tone: string; href?: string }[] = [
    {
      label: "Effectifs",
      value: String(finance.playerCount),
      sub: "joueurs licenciés",
      tone: "bg-blue-100 text-blue-700",
      href: "/roster",
    },
    {
      label: "Licences",
      value: `${finance.licenses.valid}/${finance.licenses.total}`,
      sub: `${finance.licenses.pending} en attente · ${finance.licenses.expired} expirée(s)`,
      tone: "bg-emerald-100 text-emerald-700",
      href: "/admin/licences",
    },
    {
      label: "Cotisations",
      value: `${finance.cotisations.paid.toFixed(0)} €`,
      sub: `restant dû ${remaining.toFixed(0)} €`,
      tone: "bg-amber-100 text-amber-700",
      href: "/admin/cotisations",
    },
    {
      label: "Trésorerie",
      value: `${balance.toFixed(0)} €`,
      sub: `${finance.treasury.income.toFixed(0)} € recettes · ${finance.treasury.expense.toFixed(0)} € dépenses`,
      tone: "bg-purple-100 text-purple-700",
      href: "/admin/treasury",
    },
    {
      label: "Échéances",
      value: String(finance.overdue),
      sub: "cotisations en retard",
      tone: finance.overdue > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground",
      href: "/admin/cotisations",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => {
        const inner = (
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.tone}`}>
              {card.label === "Effectifs" && <Users className="h-5 w-5" />}
              {card.label === "Licences" && <FileTextIcon className="h-5 w-5" />}
              {card.label === "Cotisations" && <Wallet className="h-5 w-5" />}
              {card.label === "Trésorerie" && <TrendingUp className="h-5 w-5" />}
              {card.label === "Échéances" && <Clock className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-lg font-bold leading-tight">{card.value}</p>
              <p className="text-[11px] text-muted-foreground truncate">{card.sub}</p>
            </div>
          </div>
        );
        if (!card.href) return <Card key={card.label}><CardContent className="p-4">{inner}</CardContent></Card>;
        return (
          <a key={card.label} href={card.href} className="rounded-xl border bg-card p-4 hover:border-foreground/20 hover:shadow-sm transition-all block">
            {inner}
          </a>
        );
      })}
    </div>
  );
}

/* ─── Showcase / Page vitrine ─── */
function ShowcaseSection({ club, onUpdate }: { club: ClubData; onUpdate: (patch: Partial<ClubData>) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState(club.public_slug || "");
  const [description, setDescription] = useState(club.description || "");
  const [contactEmail, setContactEmail] = useState(club.contact_email || "");
  const [contactPhone, setContactPhone] = useState(club.contact_phone || "");
  const [trials, setTrials] = useState<TrialRequest[]>([]);
  const [trialsLoaded, setTrialsLoaded] = useState(false);

  useEffect(() => {
    if (!club.is_public) return;
    const supabase = createClient();
    supabase
      .from("trial_requests")
      .select("*")
      .eq("club_id", club.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setTrials((data as TrialRequest[]) || []);
        setTrialsLoaded(true);
      });
  }, [club.id, club.is_public]);

  async function togglePublic() {
    setSaving(true);
    const supabase = createClient();
    const newVal = !club.is_public;
    const updates: Record<string, unknown> = { is_public: newVal };
    if (newVal && !club.public_slug) {
      const autoSlug = club.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      updates.public_slug = autoSlug;
      setSlug(autoSlug);
    }
    const { error } = await supabase.from("clubs").update(updates).eq("id", club.id);
    setSaving(false);
    if (error) {
      toast.error("Impossible de modifier la page vitrine");
      return;
    }
    onUpdate({ is_public: newVal, public_slug: (updates.public_slug as string) || club.public_slug });
    toast.success(newVal ? "Page vitrine activee" : "Page vitrine desactivee");
  }

  async function saveDetails() {
    if (!slug.trim()) {
      toast.error("L'adresse de la page est obligatoire");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("clubs").update({
      public_slug: slug.trim(),
      description: description.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
    }).eq("id", club.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Cette adresse est deja utilisee par un autre club");
      } else {
        toast.error("Impossible d'enregistrer les modifications");
      }
      return;
    }
    onUpdate({
      public_slug: slug.trim(),
      description: description.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
    });
    setEditing(false);
    toast.success("Page vitrine mise a jour");
  }

  const publicUrl = club.public_slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/c/${club.public_slug}` : null;

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          Page vitrine
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{club.is_public ? "Active" : "Desactivee"}</span>
          <Switch checked={club.is_public} onCheckedChange={togglePublic} disabled={saving} />
        </div>
      </div>

      {club.is_public && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {/* Public URL */}
          {publicUrl && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate flex-1">{publicUrl}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs shrink-0"
                onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Lien copie"); }}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copier
              </Button>
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Ouvrir
                </Button>
              </a>
            </div>
          )}

          {/* Details */}
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Adresse de la page *</Label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground shrink-0">/c/</span>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="mon-club" className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description du club</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Presentez votre club aux familles..." rows={3} className="text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email de contact</Label>
                  <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@club.fr" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telephone</Label>
                  <Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="06 12 34 56 78" className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
                <Button size="sm" className="bg-[var(--color-primary-blue)] text-white" onClick={saveDetails} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Enregistrer
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-1 text-sm">
                  {club.description && <p className="text-muted-foreground">{club.description}</p>}
                  {club.contact_email && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />{club.contact_email}
                    </p>
                  )}
                  {club.contact_phone && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />{club.contact_phone}
                    </p>
                  )}
                  {!club.description && !club.contact_email && !club.contact_phone && (
                    <p className="text-muted-foreground text-xs">Aucune information configuree</p>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => setEditing(true)}>
                  Configurer
                </Button>
              </div>
            </div>
          )}

          {/* Trial requests */}
          {trialsLoaded && trials.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <FileText className="h-3.5 w-3.5" />
                Demandes d&apos;essai ({trials.length})
              </p>
              <div className="space-y-2">
                {trials.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.player_first_name} {t.player_last_name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                        {t.position && <span>{t.position}</span>}
                        {t.birth_date && <span>Ne le {new Date(t.birth_date).toLocaleDateString("fr-FR")}</span>}
                        {t.parent_name && <span>Parent : {t.parent_name}</span>}
                      </div>
                      {t.message && <p className="text-xs text-muted-foreground mt-1 italic">{t.message}</p>}
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0 capitalize">{t.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClubPage() {
  const { user } = useAuth();
  const { switchTeam } = useTeam();
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClubs = useCallback(async (userId: string) => {
    const supabase = createClient();
    const [rowsRes, createdRes] = await Promise.all([
      supabase
        .from("club_members")
        .select("club_id, role, club:clubs(id, name, logo_url, is_public, public_slug, description, contact_email, contact_phone)")
        .eq("user_id", userId),
      supabase.from("clubs").select("id, name, logo_url").eq("created_by", userId),
    ]);

    const rows = rowsRes.data as unknown as ClubRow[] | null;
    const created = (createdRes.data || []) as { id: string; name: string; logo_url: string | null }[];
    const seen = new Set<string>();
    const joined: ClubRow[] = [];
    for (const row of rows || []) {
      if (!seen.has(row.club_id)) {
        seen.add(row.club_id);
        joined.push(row);
      }
    }
    for (const club of created) {
      if (!seen.has(club.id)) {
        seen.add(club.id);
        joined.push({
          club_id: club.id,
          role: "comite",
          club: [club],
        });
      }
    }

    if (joined.length === 0) return [];

    const result: ClubData[] = [];
    for (const row of joined as unknown as ClubRow[]) {
      const club = firstClub(row.club);
      if (!club) continue;

      const [teamsRes, membersRes] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, color_primary, color_secondary")
          .eq("club_id", club.id)
          .order("name"),
        supabase
          .from("club_members")
          .select("user_id, role")
          .eq("club_id", club.id),
      ]);

      const teamRows = (teamsRes.data || []) as {
        id: string;
        name: string;
        color_primary: string | null;
        color_secondary: string | null;
      }[];

      const teamIds = teamRows.map((t) => t.id);
      const season = currentSeasonLabel();
      const today = new Date().toISOString().slice(0, 10);
      const [finMembers, finLic, finCotis, finTx] = (await Promise.all([
        teamIds.length
          ? supabase.from("team_members").select("user_id").in("team_id", teamIds).in("role", ["player"])
          : Promise.resolve({ data: [] as { user_id: string }[] }),
        teamIds.length
          ? supabase.from("licences").select("status").in("team_id", teamIds).eq("season", season)
          : Promise.resolve({ data: [] as { status: string }[] }),
        teamIds.length
          ? supabase.from("cotisations").select("amount_expected, amount_paid, status, due_date").in("team_id", teamIds).eq("season", season)
          : Promise.resolve({ data: [] as { amount_expected: number; amount_paid: number; status: string; due_date: string | null }[] }),
        teamIds.length
          ? supabase.from("treasury_transactions").select("type, amount").in("team_id", teamIds)
          : Promise.resolve({ data: [] as { type: string; amount: number }[] }),
      ])) as [
        { data: { user_id: string }[] | null },
        { data: { status: string }[] | null },
        { data: { amount_expected: number; amount_paid: number; status: string; due_date: string | null }[] | null },
        { data: { type: string; amount: number }[] | null },
      ];

      const licenseRows = finLic.data || [];
      const cotisRows = finCotis.data || [];
      const txRows = finTx.data || [];
      const finance: ClubFinance = {
        playerCount: new Set((finMembers.data || []).map((m) => m.user_id)).size,
        licenses: {
          total: licenseRows.length,
          valid: licenseRows.filter((l) => l.status === "valid").length,
          pending: licenseRows.filter((l) => l.status === "pending_documents").length,
          expired: licenseRows.filter((l) => l.status === "expired").length,
        },
        cotisations: {
          expected: cotisRows.reduce((s, c) => s + Number(c.amount_expected), 0),
          paid: cotisRows.reduce((s, c) => s + Number(c.amount_paid), 0),
        },
        treasury: {
          income: txRows.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
          expense: txRows.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
        },
        txCount: txRows.length,
        overdue: cotisRows.filter(
          (c) => c.status !== "paid" && c.due_date && c.due_date < today
        ).length,
      };

      const now = new Date();
      const { data: events } = teamIds.length
        ? await supabase
            .from("events")
            .select("id, team_id, type, title, event_date, status, opponent, score_us, score_them, match_result")
            .in("team_id", teamIds)
            .eq("type", "match")
            .order("event_date", { ascending: true })
        : { data: [] };

      const { data: agendaEvents } = teamIds.length
        ? await supabase
            .from("events")
            .select("id, team_id, type, title, event_date, status, location, opponent")
            .in("team_id", teamIds)
            .in("type", ["match", "training"])
            .in("status", ["upcoming", "ongoing"])
            .gte("event_date", now.toISOString())
            .order("event_date", { ascending: true })
            .limit(8)
        : { data: [] };
      const agenda: ClubAgendaEvent[] = (agendaEvents || []).map((ev) => ({
        id: ev.id,
        type: ev.type as ClubAgendaEvent["type"],
        title: ev.title,
        event_date: ev.event_date,
        team_id: ev.team_id,
        team_name: teamRows.find((t) => t.id === ev.team_id)?.name || "Équipe",
        location: (ev as Record<string, unknown>).location as string | null,
        opponent: (ev as Record<string, unknown>).opponent as string | null,
        status: ev.status as ClubAgendaEvent["status"],
      }));

      const byTeam = new Map<string, MatchInfo[]>();
      for (const ev of (events || []) as unknown as {
        id: string;
        team_id: string;
        title: string;
        event_date: string;
        status: string;
        opponent: string | null;
        score_us: number | null;
        score_them: number | null;
        match_result: "win" | "loss" | "draw" | null;
      }[]) {
        if (!byTeam.has(ev.team_id)) byTeam.set(ev.team_id, []);
        byTeam.get(ev.team_id)!.push({
          id: ev.id,
          title: ev.title,
          event_date: ev.event_date,
          status: ev.status as MatchInfo["status"],
          opponent: ev.opponent,
          score_us: ev.score_us,
          score_them: ev.score_them,
          match_result: ev.match_result,
        });
      }

      const teams: ClubTeam[] = teamRows.map((t) => {
        const matches = byTeam.get(t.id) || [];
        const results = matches
          .filter((m) => m.status === "completed")
          .slice(-3)
          .reverse();
        const nextMatch =
          matches.find(
            (m) => m.status === "upcoming" && new Date(m.event_date) >= now
          ) || null;
        return {
          id: t.id,
          name: t.name,
          color_primary: t.color_primary,
          color_secondary: t.color_secondary,
          nextMatch,
          results,
        };
      });

      const memberRows = (membersRes.data || []) as {
        user_id: string;
        role: "comite";
      }[];
      const userIds = memberRows.map((m) => m.user_id);
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", userIds)
        : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      result.push({
        id: club.id,
        name: club.name,
        logo_url: club.logo_url,
        myRole: row.role,
        teams,
        members: memberRows.map((m) => ({
          ...m,
          profile: profileMap.get(m.user_id) as CommitteeMember["profile"],
        })),
        finance,
        agenda,
        is_public: (club as Record<string, unknown>).is_public === true,
        public_slug: ((club as Record<string, unknown>).public_slug as string) || null,
        description: ((club as Record<string, unknown>).description as string) || null,
        contact_email: ((club as Record<string, unknown>).contact_email as string) || null,
        contact_phone: ((club as Record<string, unknown>).contact_phone as string) || null,
      });
    }
    return result;
  }, []);

  useEffect(() => {
    if (!user) return;
    loadClubs(user.id).then((data) => {
      setClubs(data);
      setLoading(false);
    });
  }, [user, loadClubs]);

  function openTeam(teamId: string, href: string) {
    switchTeam(teamId);
    router.push(href);
  }

  return (
    <div className="max-w-5xl mx-auto section-gap">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          Espace club
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vue d&apos;ensemble des équipes du club (lecture seule)
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Chargement...
          </CardContent>
        </Card>
      ) : clubs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Vous n&apos;êtes membre du comité d&apos;aucun club pour le moment.
            </p>
          </CardContent>
        </Card>
      ) : (
        clubs.map((club) => (
          <div key={club.id} className="space-y-3 md:space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {club.logo_url ? (
                <img
                  src={club.logo_url}
                  alt={club.name}
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
              <h2 className="text-lg font-bold">{club.name}</h2>
              <Badge variant="secondary" className="text-[10px]">
                Comité
              </Badge>
              <span className="text-xs text-muted-foreground">
                · {club.teams.length} équipe(s)
              </span>
              <ClubAnnounceDialog
                clubId={club.id}
                clubName={club.name}
                variant="ghost"
              />
            </div>

            {club.teams.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Aucune équipe dans ce club.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {club.teams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    onOpen={(href) => openTeam(team.id, href)}
                  />
                ))}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Pilotage &amp; finances
              </p>
              <ClubFinanceStrip finance={club.finance} />
            </div>

            {club.agenda.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Agenda des équipes
                </p>
                <Card>
                  <CardContent className="p-0 divide-y">
                    {club.agenda.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => openTeam(ev.team_id, "/calendar")}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors"
                      >
                        <div className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              club.teams.find((t) => t.id === ev.team_id)
                                ?.color_primary || "var(--color-royal)",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {ev.type === "match"
                              ? `Match ${ev.opponent ? "vs " + ev.opponent : ""}`.trim() || ev.title
                              : ev.title || "Entraînement"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {ev.team_name}
                            {ev.location ? ` · ${ev.location}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">
                            {new Date(ev.event_date).toLocaleDateString("fr-FR", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(ev.event_date).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Comité ({club.members.length})
              </p>
              {club.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun membre du comité.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {club.members.map((m) => (
                    <span
                      key={m.user_id}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
                    >
                      <span className="font-medium truncate">
                        {m.profile?.first_name} {m.profile?.last_name}
                      </span>
                      {m.user_id === user?.id && (
                        <span className="text-xs text-muted-foreground">(vous)</span>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        Comité
                      </Badge>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <ShowcaseSection club={club} onUpdate={(patch) => setClubs(prev => prev.map(c => c.id === club.id ? { ...c, ...patch } : c))} />

            <ActivityLogCard clubId={club.id} />
          </div>
        ))
      )}
    </div>
  );
}
