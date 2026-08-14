"use client";

import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { normalizeFffNumber } from "@/lib/clubs";
import { useChatUnread } from "@/lib/useChatUnread";
import { useHiddenTabs } from "@/lib/tabs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Users,
  BarChart3,
  MessageSquare,
  Settings,
  Settings2,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Building2,
  CalendarRange,
  Trophy,
  Heart,
  Car,
  ListTodo,
  Swords,
  Image,
  Bell,
  Dumbbell,
  Medal,
  Vote,
  Package,
  Flag,
  GitCompareArrows,
  Wallet,
  PiggyBank,
  MapPin,
  RefreshCw,
  TrendingDown,
  ClipboardList,
  PartyPopper,
  Flame,
  Newspaper,
  CalendarClock,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useState } from "react";

/* ─── Primary nav: 5 main spaces ─── */
const primaryNav = [
  { key: "dashboard", href: "/", label: "Accueil", icon: Home },
  { key: "calendar", href: "/calendar", label: "Agenda", icon: Calendar },
  { key: "roster", href: "/roster", label: "Equipe", icon: Users },
  { key: "stats", href: "/stats", label: "Performance", icon: BarChart3 },
  { key: "chat", href: "/chat", label: "Messages", icon: MessageSquare },
];

/* ─── Grouped secondary nav ─── */
const teamItems = [
  { key: "medical", href: "/medical", label: "Infirmerie", icon: Heart },
  { key: "carpooling", href: "/carpooling", label: "Covoiturage", icon: Car },
  { key: "attendance", href: "/attendance", label: "Presences", icon: Users },
  { key: "tasks", href: "/tasks", label: "Taches", icon: ListTodo },
  { key: "polls", href: "/polls", label: "Sondages", icon: Vote },
  { key: "gallery", href: "/gallery", label: "Galerie", icon: Image },
  { key: "meetings", href: "/meetings", label: "Reunions parents", icon: ClipboardList, coachOnly: true },
];

const performanceItems = [
  { key: "physical", href: "/physical", label: "Prepa physique", icon: Dumbbell, coachOnly: true },
  { key: "tactics", href: "/tactics", label: "Tactique", icon: Swords, coachOnly: true },
  { key: "championship", href: "/championship", label: "Championnat", icon: Medal },
  { key: "adversaires", href: "/adversaires", label: "Adversaires", icon: Flag },
  { key: "compare", href: "/stats/compare", label: "Comparer", icon: GitCompareArrows, coachOnly: true },
  { key: "drop", href: "/stats/drop", label: "Baisse de forme", icon: TrendingDown, coachOnly: true },
  { key: "trophies", href: "/trophies", label: "Trophees", icon: Trophy },
  { key: "tournament", href: "/tournament", label: "Tournois", icon: Trophy },
];

const clubItems = [
  { key: "club", href: "/club", label: "Espace club", icon: Building2, clubOnly: true },
  { key: "terrains", href: "/club/terrains", label: "Terrains", icon: MapPin, clubOnly: true },
  { key: "mutations", href: "/club/mutations", label: "Mutations", icon: RefreshCw, clubOnly: true },
  { key: "clubfeed", href: "/club/feed", label: "Fil du club", icon: Newspaper, clubTeamOnly: true },
  { key: "material", href: "/material", label: "Materiel", icon: Package, coachAndClub: true },
  { key: "cotisations", href: "/admin/cotisations", label: "Cotisations", icon: Wallet, clubOnly: true },
  { key: "treasury", href: "/admin/treasury", label: "Tresorerie", icon: PiggyBank, clubOnly: true },
  { key: "cagnotte", href: "/cagnotte", label: "Cagnottes", icon: PiggyBank, coachOnly: true },
];

const moreItems = [
  { key: "season", href: "/season", label: "Plan de saison", icon: CalendarRange },
  { key: "challenge", href: "/challenge", label: "Defi de la semaine", icon: Flame },
  { key: "fin-saison", href: "/fin-saison", label: "Fin de saison", icon: PartyPopper },
  { key: "notifications", href: "/notifications", label: "Notifications", icon: Bell },
];

const coachAdminItems = [
  { href: "/admin/players", label: "Gestion joueurs", icon: UserCog },
  { href: "/admin/deadlines", label: "Echeances", icon: CalendarClock },
];

const comiteOnlyHrefs = new Set(["/club", "/club/feed", "/club/terrains", "/calendar", "/roster", "/stats", "/notifications", "/material", "/admin/cotisations", "/admin/treasury"]);

/* ─── Collapsible Section Component ─── */
function NavSection({
  title,
  items,
  isCoach,
  hasClubRole,
  isComiteOnly,
  currentTeam,
  hiddenTabs,
  pathname,
}: {
  title: string;
  items: typeof teamItems;
  isCoach: boolean;
  hasClubRole: boolean;
  isComiteOnly: boolean;
  currentTeam: { club_id: string } | null;
  hiddenTabs: Set<string>;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);

  const filtered = items.filter((item) => {
    if ((item as { coachOnly?: boolean }).coachOnly && !isCoach) return false;
    if ((item as { clubOnly?: boolean }).clubOnly && !hasClubRole) return false;
    if ((item as { coachAndClub?: boolean }).coachAndClub && !isCoach && !hasClubRole) return false;
    if ((item as { clubTeamOnly?: boolean }).clubTeamOnly && !currentTeam?.club_id && !hasClubRole) return false;
    if (isComiteOnly && !comiteOnlyHrefs.has(item.href)) return false;
    if (hiddenTabs.has(item.key)) return false;
    return true;
  });

  if (filtered.length === 0) return null;

  // Auto-open if any item in this section is active
  const hasActive = filtered.some((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

  const isOpen = open || hasActive;

  return (
    <div>
      <button
        onClick={() => setOpen(!isOpen)}
        className="flex items-center justify-between w-full rounded-lg px-3 py-2 text-[13px] font-semibold text-white/50 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
      >
        <span>{title}</span>
        <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
      </button>
      {isOpen && (
        <div className="space-y-0.5 mt-0.5 ml-1 border-l border-white/[0.08] pl-2">
          {filtered.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? "bg-white/[0.12] text-white"
                    : "text-white/45 hover:bg-white/[0.06] hover:text-white/90"
                }`}
              >
                <item.icon className={`h-[16px] w-[16px] shrink-0 ${active ? "text-[var(--color-primary-blue)]" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { currentTeam, teams, switchTeam, userRole, clubMemberships } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const hasClubRole = clubMemberships.length > 0;
  const isComiteOnly = hasClubRole && userRole === null;
  const hiddenTabs = useHiddenTabs(currentTeam?.id);
  const { total: unreadChat } = useChatUnread(currentTeam?.id, user?.id, userRole ?? undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinMode, setJoinMode] = useState(false);
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [fffNumber, setFffNumber] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinRole, setJoinRole] = useState<"player" | "parent" | "coach">("player");
  const [creating, setCreating] = useState(false);

  const initials = user?.profile
    ? `${user.profile.first_name?.[0] || ""}${user.profile.last_name?.[0] || ""}`
    : "??";

  const roleLabel = isComiteOnly
    ? "Comite"
    : userRole === "owner"
      ? "Coach"
      : userRole === "coach"
        ? "Coach"
        : userRole === "parent"
          ? "Parent"
          : "Joueur";

  const sectionProps = {
    isCoach,
    hasClubRole,
    isComiteOnly,
    currentTeam: currentTeam ? { club_id: currentTeam.club_id } : null,
    hiddenTabs,
    pathname,
  };

  async function handleCreateTeam() {
    if (!clubName.trim() || !teamName.trim()) return;
    const fff = normalizeFffNumber(fffNumber);
    if (!fff) {
      toast.error("Numero d'affiliation FFF invalide (6 chiffres requis)");
      return;
    }
    setCreating(true);
    try {
      const res = await authFetch("/api/auth/create-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user!.id, clubName: clubName.trim(), teamName: teamName.trim(), fffNumber: fff }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la creation");
        setCreating(false);
        return;
      }
      toast.success(`Equipe creee ! Code d'invitation : ${data.inviteCode}`);
      setCreateOpen(false);
      setClubName("");
      setTeamName("");
      setFffNumber("");
      setInviteCode("");
      setJoinMode(false);
      localStorage.setItem("selectedTeamId", data.team.id);
      window.location.href = "/";
    } catch {
      toast.error("Erreur de connexion au serveur");
    }
    setCreating(false);
  }

  async function handleJoinTeam() {
    if (!inviteCode.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch("/api/auth/join-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user!.id, inviteCode: inviteCode.trim(), role: joinRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Code invalide");
        setCreating(false);
        return;
      }
      toast.success(data.message || "Equipe rejointe !");
      setCreateOpen(false);
      setInviteCode("");
      setJoinMode(false);
      localStorage.setItem("selectedTeamId", data.team.id);
      if (joinRole === "parent") {
        window.location.href = `/link-child?teamId=${data.team.id}`;
      } else {
        window.location.href = "/";
      }
    } catch {
      toast.error("Erreur de connexion au serveur");
    }
    setCreating(false);
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="hidden lg:flex lg:w-[260px] lg:flex-col lg:shrink-0 bg-[var(--color-navy)] text-white h-screen">
      {/* ─── Logo ─── */}
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-white/[0.08]">
        <img src="/logo.svg" alt="Benchrs" className="h-8 w-8" />
        <span className="text-xl font-bold tracking-tight">Benchrs</span>
      </div>

      {/* ─── Team Selector ─── */}
      {currentTeam && !isComiteOnly && (
        <div className="px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            {currentTeam.logo_url ? (
              <img src={currentTeam.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Trophy className="h-4 w-4 text-white/50" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {teams.length > 1 ? (
                <select
                  value={currentTeam.id}
                  onChange={(e) => switchTeam(e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-white appearance-none cursor-pointer truncate focus:outline-none"
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id} className="bg-[var(--color-navy)] text-white">
                      {team.club?.name ? `${team.club.name} - ` : ""}{team.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm font-semibold truncate">{currentTeam.club?.name || currentTeam.name}</p>
              )}
              {currentTeam.club && teams.length <= 1 && (
                <p className="text-xs text-white/50 truncate">{currentTeam.name}</p>
              )}
            </div>
            {teams.length > 1 && <ChevronsUpDown className="h-3.5 w-3.5 text-white/30 shrink-0" />}
            <Link href="/settings/team" className="text-white/30 hover:text-white shrink-0 p-1 rounded-lg hover:bg-white/[0.06] transition-colors" title="Parametres de l'equipe">
              <Settings2 className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* ─── Navigation ─── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
        {/* Primary: 5 main items always visible */}
        <div className="space-y-0.5">
          {primaryNav.map((item) => {
            const active = isActive(item.href);
            const badge = item.href === "/chat" ? unreadChat : 0;
            if (isComiteOnly && !["/", "/calendar", "/roster", "/stats"].includes(item.href)) return null;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? "bg-white/[0.12] text-white"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
                }`}
              >
                <span className="relative flex items-center justify-center w-5 h-5">
                  <item.icon className={`h-[18px] w-[18px] ${active ? "text-[var(--color-primary-blue)]" : ""}`} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-primary-blue)] px-1 text-[10px] font-bold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Secondary: grouped by domain, collapsible */}
        <div className="pt-3 mt-3 border-t border-white/[0.08] space-y-1">
          <NavSection title="Equipe" items={teamItems} {...sectionProps} />
          <NavSection title="Performance" items={performanceItems} {...sectionProps} />
          <NavSection title="Club" items={clubItems} {...sectionProps} />
        </div>

        {/* More items */}
        <div className="pt-3 mt-1 border-t border-white/[0.08] space-y-0.5">
          {moreItems
            .filter((item) => {
              if (isComiteOnly && !comiteOnlyHrefs.has(item.href)) return false;
              if (hiddenTabs.has(item.key)) return false;
              return true;
            })
            .map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                    active
                      ? "bg-white/[0.12] text-white"
                      : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
                  }`}
                >
                  <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[var(--color-primary-blue)]" : ""}`} />
                  {item.label}
                </Link>
              );
            })}
        </div>

        {/* Coach admin */}
        {isCoach && (
          <div className="pt-3 mt-1 border-t border-white/[0.08]">
            <p className="px-3 py-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-widest">
              Admin
            </p>
            <div className="space-y-0.5">
              {coachAdminItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                      active
                        ? "bg-white/[0.12] text-white"
                        : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
                    }`}
                  >
                    <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[var(--color-primary-blue)]" : ""}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* ─── Bottom: Settings + User ─── */}
      <div className="border-t border-white/[0.08] p-3 space-y-1">
        <Link
          href="/settings"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
            isActive("/settings")
              ? "bg-white/[0.12] text-white"
              : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
          }`}
        >
          <Settings className="h-[18px] w-[18px]" />
          Parametres
        </Link>

        {/* User profile */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Avatar className="h-8 w-8 shrink-0">
            {user?.profile?.avatar_url ? (
              <img src={user.profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <AvatarFallback className="bg-[var(--color-primary-blue)] text-white text-xs font-bold">
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.profile?.first_name}</p>
            <p className="text-[11px] text-white/40 capitalize">{roleLabel}</p>
          </div>
        </div>
      </div>

      {/* ─── Create/Join Team Dialog ─── */}
      {!isComiteOnly && (
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setJoinMode(false); }}>
          <DialogTrigger render={<button className="hidden" />}>
            + Creer une equipe
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{joinMode ? "Rejoindre une equipe" : "Creer une equipe"}</DialogTitle>
            </DialogHeader>
            <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30 mb-4">
              <button className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!joinMode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setJoinMode(false); setInviteCode(""); }}>Creer</button>
              <button className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${joinMode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setJoinMode(true); setClubName(""); setTeamName(""); }}>Rejoindre</button>
            </div>
            {joinMode ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Code d&apos;invitation</Label>
                  <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Entrez le code" />
                </div>
                <div className="space-y-2">
                  <Label>Votre role dans cette equipe</Label>
                  <Select value={joinRole} onValueChange={(v) => v && setJoinRole(v as "player" | "parent" | "coach")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player">Joueur</SelectItem>
                      <SelectItem value="parent">Parent</SelectItem>
                      <SelectItem value="coach">Coach</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" onClick={handleJoinTeam} disabled={!inviteCode.trim() || creating}>
                  {creating ? "Connexion..." : "Rejoindre l'equipe"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom du club</Label>
                  <Input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="AS Monaco" />
                </div>
                <div className="space-y-2">
                  <Label>Numero d&apos;affiliation FFF *</Label>
                  <Input inputMode="numeric" value={fffNumber} onChange={(e) => setFffNumber(e.target.value)} placeholder="501234" />
                </div>
                <div className="space-y-2">
                  <Label>Nom de l&apos;equipe</Label>
                  <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="U17 Senior" />
                </div>
                <Button className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" onClick={handleCreateTeam} disabled={!clubName.trim() || !teamName.trim() || creating}>
                  {creating ? "Creation..." : "Creer l'equipe"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </aside>
  );
}
