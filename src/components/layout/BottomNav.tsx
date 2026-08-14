"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { normalizeFffNumber } from "@/lib/clubs";
import { useChatUnread } from "@/lib/useChatUnread";
import { useHiddenTabs } from "@/lib/tabs";
import { Sheet, SheetContent, SheetClose, SheetTrigger } from "@/components/ui/sheet";
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
import { toast } from "sonner";
import {
  Home,
  Calendar,
  Users,
  BarChart3,
  MessageSquare,
  X,
  Menu as MenuIcon,
  Plus,
  Settings,
  Settings2,
  Heart,
  Car,
  ListTodo,
  Swords,
  Image,
  Trophy,
  Bell,
  CalendarRange,
  Flame,
  Building2,
  Newspaper,
  Vote,
  Package,
  Flag,
  GitCompareArrows,
  PiggyBank,
  MapPin,
  RefreshCw,
  TrendingDown,
  ClipboardList,
  PartyPopper,
  Dumbbell,
  Medal,
  Wallet,
  CalendarClock,
  UserCog,
} from "lucide-react";

/* ─── More menu items (secondary features) ─── */
const moreItems = [
  { key: "stats", href: "/stats", label: "Statistiques", icon: BarChart3 },
  { key: "physical", href: "/physical", label: "Prepa physique", icon: Dumbbell },
  { key: "medical", href: "/medical", label: "Infirmerie", icon: Heart },
  { key: "carpooling", href: "/carpooling", label: "Covoiturage", icon: Car },
  { key: "tasks", href: "/tasks", label: "Taches", icon: ListTodo },
  { key: "polls", href: "/polls", label: "Sondages", icon: Vote },
  { key: "tactics", href: "/tactics", label: "Tactique", icon: Swords, coachOnly: true },
  { key: "season", href: "/season", label: "Plan de saison", icon: CalendarRange },
  { key: "challenge", href: "/challenge", label: "Defi de la semaine", icon: Flame },
  { key: "club", href: "/club", label: "Espace club", icon: Building2, clubOnly: true },
  { key: "terrains", href: "/club/terrains", label: "Terrains", icon: MapPin, clubOnly: true },
  { key: "mutations", href: "/club/mutations", label: "Mutations", icon: RefreshCw, clubOnly: true },
  { key: "clubfeed", href: "/club/feed", label: "Fil du club", icon: Newspaper, clubTeamOnly: true },
  { key: "gallery", href: "/gallery", label: "Galerie", icon: Image },
  { key: "trophies", href: "/trophies", label: "Trophees", icon: Trophy },
  { key: "championship", href: "/championship", label: "Championnat", icon: Medal },
  { key: "material", href: "/material", label: "Materiel", icon: Package, coachAndClub: true },
  { key: "adversaires", href: "/adversaires", label: "Adversaires", icon: Flag },
  { key: "compare", href: "/stats/compare", label: "Comparer", icon: GitCompareArrows, coachOnly: true },
  { key: "drop", href: "/stats/drop", label: "Baisse de forme", icon: TrendingDown, coachOnly: true },
  { key: "tournament", href: "/tournament", label: "Tournois", icon: Trophy },
  { key: "cotisations", href: "/admin/cotisations", label: "Cotisations", icon: Wallet, clubOnly: true },
  { key: "treasury", href: "/admin/treasury", label: "Tresorerie", icon: PiggyBank, clubOnly: true },
  { key: "notifications", href: "/notifications", label: "Notifications", icon: Bell },
  { key: "meetings", href: "/meetings", label: "Reunions parents", icon: ClipboardList, coachOnly: true },
  { key: "cagnotte", href: "/cagnotte", label: "Cagnottes", icon: PiggyBank, coachOnly: true },
  { key: "fin-saison", href: "/fin-saison", label: "Fin de saison", icon: PartyPopper },
];

const comiteOnlyHrefs = new Set(["/club", "/club/feed", "/club/terrains", "/calendar", "/roster", "/stats", "/notifications", "/material", "/admin/cotisations", "/admin/treasury"]);

const coachItems = [
  { href: "/admin/players", label: "Gestion joueurs", icon: UserCog },
  { href: "/admin/deadlines", label: "Echeances", icon: CalendarClock },
];

function SheetContentInner({ close }: { close: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentTeam, teams, switchTeam, userRole, clubMemberships } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const hasClubRole = clubMemberships.length > 0;
  const isComiteOnly = hasClubRole && userRole === null;
  const hiddenTabs = useHiddenTabs(currentTeam?.id);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [joinMode, setJoinMode] = useState(false);
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [fffNumber, setFffNumber] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinRole, setJoinRole] = useState<"player" | "parent" | "coach">("player");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreateTeam() {
    if (!clubName.trim() || !teamName.trim() || !user) return;
    const fff = normalizeFffNumber(fffNumber);
    if (!fff) {
      toast.error("Numero d'affiliation FFF invalide (6 chiffres requis)");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch("/api/auth/create-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, clubName: clubName.trim(), teamName: teamName.trim(), fffNumber: fff }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erreur"); setSubmitting(false); return; }
      toast.success(`Equipe creee ! Code : ${data.inviteCode}`);
      setShowTeamForm(false);
      setClubName(""); setTeamName(""); setFffNumber("");
      localStorage.setItem("selectedTeamId", data.team.id);
      window.location.href = "/";
    } catch { toast.error("Erreur de connexion"); }
    setSubmitting(false);
  }

  async function handleJoinTeam() {
    if (!inviteCode.trim() || !user) return;
    setSubmitting(true);
    try {
      const res = await authFetch("/api/auth/join-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, inviteCode: inviteCode.trim(), role: joinRole }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Code invalide"); setSubmitting(false); return; }
      toast.success(data.message || "Equipe rejointe !");
      setShowTeamForm(false);
      setInviteCode("");
      localStorage.setItem("selectedTeamId", data.team.id);
      if (joinRole === "parent") {
        window.location.href = `/link-child?teamId=${data.team.id}`;
      } else {
        window.location.href = "/";
      }
    } catch { toast.error("Erreur de connexion"); }
    setSubmitting(false);
  }

  return (
    <SheetContent side="left" className="w-72 p-0 bg-[var(--color-navy)]" showCloseButton={false}>
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4 border-b border-white/[0.08]" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Benchrs" className="h-7 w-7" />
          <span className="text-lg font-bold text-white tracking-tight">Benchrs</span>
        </div>
        <SheetClose className="text-white/40 hover:text-white p-1">
          <X className="h-5 w-5" />
        </SheetClose>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Team selector */}
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
                    onChange={(e) => { switchTeam(e.target.value); close(); }}
                    className="w-full bg-transparent text-sm font-semibold text-white appearance-none cursor-pointer truncate focus:outline-none"
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id} className="bg-[var(--color-navy)]">
                        {team.club?.name ? `${team.club.name} - ` : ""}{team.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <p className="text-sm font-semibold truncate text-white">{currentTeam.club?.name || currentTeam.name}</p>
                    {currentTeam.club && (
                      <p className="text-xs text-white/40 truncate">{currentTeam.name}</p>
                    )}
                  </>
                )}
              </div>
              <Link href="/settings/team" onClick={close} className="text-white/30 hover:text-white shrink-0">
                <Settings2 className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Team actions */}
        {!isComiteOnly && (
          <div className="px-3 py-2.5 border-b border-white/[0.08]">
            <div className="flex gap-1.5">
              <button
                onClick={() => { setShowTeamForm(true); setJoinMode(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-2 text-xs font-medium text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Rejoindre
              </button>
            </div>
          </div>
        )}

        {showTeamForm && (
          <div className="px-4 py-3 border-b border-white/[0.08] space-y-3">
            <div className="flex gap-1 rounded-lg border border-white/15 p-0.5">
              <button className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!joinMode ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`} onClick={() => { setJoinMode(false); setInviteCode(""); }}>Creer</button>
              <button className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${joinMode ? "bg-white/15 text-white" : "text-white/50 hover:text-white"}`} onClick={() => { setJoinMode(true); setClubName(""); setTeamName(""); }}>Rejoindre</button>
            </div>
            {joinMode ? (
              <div className="space-y-2.5">
                <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Code d'invitation" className="bg-white/[0.06] border-white/15 text-white text-sm placeholder:text-white/30 h-9" />
                <div className="space-y-1">
                  <Label className="text-white/50 text-xs">Votre role</Label>
                  <Select value={joinRole} onValueChange={(v) => v && setJoinRole(v as "player" | "parent" | "coach")}>
                    <SelectTrigger className="bg-white/[0.06] border-white/15 text-white text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="player">Joueur</SelectItem>
                      <SelectItem value="parent">Parent</SelectItem>
                      <SelectItem value="coach">Coach</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-white border-white/15 hover:bg-white/[0.06]" onClick={() => { setShowTeamForm(false); setInviteCode(""); }}>Annuler</Button>
                  <Button size="sm" className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" onClick={handleJoinTeam} disabled={!inviteCode.trim() || submitting}>{submitting ? "..." : "Rejoindre"}</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <Input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="Nom du club" className="bg-white/[0.06] border-white/15 text-white text-sm placeholder:text-white/30 h-9" />
                <Input inputMode="numeric" value={fffNumber} onChange={(e) => setFffNumber(e.target.value)} placeholder="Numero FFF (6 chiffres)" className="bg-white/[0.06] border-white/15 text-white text-sm placeholder:text-white/30 h-9" />
                <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Nom de l'equipe" className="bg-white/[0.06] border-white/15 text-white text-sm placeholder:text-white/30 h-9" />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-white border-white/15 hover:bg-white/[0.06]" onClick={() => { setShowTeamForm(false); setClubName(""); setTeamName(""); setFffNumber(""); }}>Annuler</Button>
                  <Button size="sm" className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" onClick={handleCreateTeam} disabled={!clubName.trim() || !teamName.trim() || submitting}>{submitting ? "..." : "Creer"}</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Nav items */}
        <nav className="py-3 px-3 space-y-0.5">
          {moreItems
            .filter((item) => {
              if (item.coachOnly && !isCoach) return false;
              if ((item as { clubOnly?: boolean }).clubOnly && !hasClubRole) return false;
              if ((item as { coachAndClub?: boolean }).coachAndClub && !isCoach && !hasClubRole) return false;
              if ((item as { clubTeamOnly?: boolean }).clubTeamOnly && !currentTeam?.club_id && !hasClubRole) return false;
              if (isComiteOnly && !comiteOnlyHrefs.has(item.href)) return false;
              if (hiddenTabs.has(item.key)) return false;
              return true;
            })
            .map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? "bg-white/[0.12] text-white"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
                }`}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {isCoach && (
          <>
            <div className="mx-3 border-t border-white/[0.08]" />
            <p className="px-5 pt-3 pb-1 text-[10px] font-semibold text-white/30 uppercase tracking-widest">
              Admin
            </p>
            <nav className="pb-3 px-3 space-y-0.5">
              {coachItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                      active
                        ? "bg-white/[0.12] text-white"
                        : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
                    }`}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}

        <div className="border-t border-white/[0.08] p-3">
          <Link
            href="/settings"
            onClick={close}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-white/55 hover:bg-white/[0.06] hover:text-white/90 transition-all duration-150"
          >
            <Settings className="h-[18px] w-[18px]" />
            Parametres
          </Link>
        </div>
      </div>
    </SheetContent>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentTeam, userRole, clubMemberships } = useTeam();
  const { total: unreadChat } = useChatUnread(currentTeam?.id, user?.id, userRole ?? undefined);
  const close = useCallback(() => {
    const closeBtn = document.querySelector<HTMLButtonElement>('[data-bottom-sheet-close]');
    closeBtn?.click();
  }, []);

  const isComiteOnly = clubMemberships.length > 0 && userRole === null;

  const items = isComiteOnly
    ? [
        { href: "/club", label: "Club", icon: Building2 },
        { href: "/calendar", label: "Agenda", icon: Calendar },
        { href: "/roster", label: "Equipe", icon: Users },
        { href: "/stats", label: "Perf", icon: BarChart3 },
      ]
    : [
        { href: "/", label: "Accueil", icon: Home },
        { href: "/calendar", label: "Agenda", icon: Calendar },
        { href: "/roster", label: "Equipe", icon: Users },
        { href: "/stats", label: "Perf", icon: BarChart3 },
        { href: "/chat", label: "Messages", icon: MessageSquare },
      ];

  return (
    <Sheet>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center bg-[var(--color-navy)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Subtle top border */}
        <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.08]" />

        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badge = item.href === "/chat" ? unreadChat : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active
                  ? "text-white"
                  : "text-white/35"
              }`}
            >
              {active && (
                <span className="absolute top-0 left-1/4 right-1/4 h-[2px] rounded-full bg-[var(--color-primary-blue)]" />
              )}
              <span className="relative flex items-center justify-center h-6 w-6">
                <item.icon className={`h-5 w-5 ${active ? "text-[var(--color-primary-blue)]" : ""}`} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-primary-blue)] px-1 text-[10px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
        <SheetTrigger
          className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-white/35 transition-colors active:text-white/60"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <MenuIcon className="h-5 w-5" />
          Plus
        </SheetTrigger>
      </nav>
      <SheetClose data-bottom-sheet-close className="hidden" />
      <SheetContentInner close={close} />
    </Sheet>
  );
}
