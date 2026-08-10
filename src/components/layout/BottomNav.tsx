"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { normalizeFffNumber } from "@/lib/clubs";
import { useChatUnread } from "@/lib/useChatUnread";
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
import { X, Menu as MenuIcon, Plus, Medal, Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { useHiddenTabs } from "@/lib/tabs";
import {
  LayoutDashboard,
  Calendar,
  Users,
  MessageSquare,
  BarChart3,
  Heart,
  Car,
  ListTodo,
  Swords,
  Image,
  Trophy,
  Bell,
  Settings,
  Settings2,
  UserCog,
  Wallet,
  CalendarRange,
  Flame,
  Building2,
  Newspaper,
  Vote,
  Package,
  Flag,
  GitCompareArrows,
  PiggyBank,
  CalendarClock,
} from "lucide-react";

const navItems = [
  { key: "stats", href: "/stats", label: "Statistiques", icon: BarChart3 },
  { key: "physical", href: "/physical", label: "Prépa physique", icon: Dumbbell },
  { key: "medical", href: "/medical", label: "Infirmerie", icon: Heart },
  { key: "carpooling", href: "/carpooling", label: "Covoiturage", icon: Car },
  { key: "tasks", href: "/tasks", label: "Tâches", icon: ListTodo },
  { key: "polls", href: "/polls", label: "Sondages", icon: Vote },
  { key: "tactics", href: "/tactics", label: "Tactique", icon: Swords, coachOnly: true },
  { key: "season", href: "/season", label: "Plan de saison", icon: CalendarRange },
  { key: "challenge", href: "/challenge", label: "Défi de la semaine", icon: Flame },
  { key: "club", href: "/club", label: "Espace club", icon: Building2, clubOnly: true },
  { key: "clubfeed", href: "/club/feed", label: "Fil du club", icon: Newspaper, clubTeamOnly: true },
  { key: "gallery", href: "/gallery", label: "Galerie", icon: Image },
  { key: "trophies", href: "/trophies", label: "Trophées", icon: Trophy },
  { key: "championship", href: "/championship", label: "Championnat", icon: Medal },
  { key: "material", href: "/material", label: "Matériel", icon: Package },
  { key: "adversaires", href: "/adversaires", label: "Adversaires", icon: Flag },
  { key: "compare", href: "/stats/compare", label: "Comparer", icon: GitCompareArrows },
  { key: "notifications", href: "/notifications", label: "Notifications", icon: Bell },
];

const comiteOnlyHrefs = new Set(["/club", "/club/feed", "/calendar", "/roster", "/stats", "/notifications"]);

const coachItems = [
  { href: "/admin/players", label: "Gestion joueurs", icon: UserCog },
  { href: "/admin/cotisations", label: "Cotisations", icon: Wallet },
  { href: "/admin/treasury", label: "Trésorerie", icon: PiggyBank },
  { href: "/admin/deadlines", label: "Échéances", icon: CalendarClock },
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
  const [joinRole, setJoinRole] = useState<"player" | "coach" | "parent">("player");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreateTeam() {
    if (!clubName.trim() || !teamName.trim() || !user) return;
    const fff = normalizeFffNumber(fffNumber);
    if (!fff) {
      toast.error("Numéro d'affiliation FFF invalide (6 chiffres requis)");
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
      toast.success(`Équipe créée ! Code : ${data.inviteCode}`);
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
      toast.success(data.message || "Équipe rejointe !");
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
    <SheetContent side="left" className="w-64 p-0 bg-[var(--color-navy)]" showCloseButton={false}>
      <div className="flex h-12 shrink-0 items-center justify-between px-4 border-b border-white/10" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Benchrs" className="h-8 w-8" />
          <span className="text-xl font-bold text-white">Benchrs</span>
        </div>
        <SheetClose className="text-white/60 hover:text-white">
          <X className="h-5 w-5" />
        </SheetClose>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
      {currentTeam && !isComiteOnly && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          {teams.length > 1 ? (
            <>
              <select
                value={currentTeam.id}
                onChange={(e) => {
                  switchTeam(e.target.value);
                  close();
                }}
                className="flex-1 bg-white/10 text-white text-sm rounded-lg px-3 py-2 appearance-none cursor-pointer hover:bg-white/15 transition-colors"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id} className="bg-[var(--color-navy)]">
                    {team.club?.name ? `${team.club.name} — ` : ""}{team.name}
                  </option>
                ))}
              </select>
              {!isComiteOnly && (
                <Link href="/settings/team" onClick={close} className="text-white/40 hover:text-white shrink-0">
                  <Settings2 className="h-5 w-5" />
                </Link>
              )}
            </>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{currentTeam.club?.name || currentTeam.name}</p>
                {currentTeam.club && (
                  <p className="text-xs text-white/50 truncate">{currentTeam.name}</p>
                )}
              </div>
              {!isComiteOnly && (
                <Link href="/settings/team" onClick={close} className="text-white/40 hover:text-white shrink-0">
                  <Settings2 className="h-5 w-5" />
                </Link>
              )}
            </>
          )}
        </div>
      )}

      {/* Mobile: Team management actions */}
      {!isComiteOnly && (
      <>
      <div className="px-2 py-2 border-b border-white/10">
        <p className="px-1 pb-1 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
          Équipe
        </p>
        <div className="flex gap-1">
          <Link
            href="/roster"
            onClick={close}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-2 text-xs font-medium text-white/80 hover:bg-white/15 transition-colors"
          >
            <Users className="h-3.5 w-3.5" />
            Analyser
          </Link>
          <Link
            href="/settings/team"
            onClick={close}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-2 text-xs font-medium text-white/80 hover:bg-white/15 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Gérer
          </Link>
          <button
            onClick={() => { setShowTeamForm(true); setJoinMode(false); }}
            className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-2 text-xs font-medium text-white/80 hover:bg-white/15 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Rejoindre
          </button>
        </div>
      </div>

      {showTeamForm && (
        <div className="px-3 py-3 border-b border-white/10 space-y-3">
          <div className="flex gap-1 rounded-lg border border-white/20 p-0.5">
            <button className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!joinMode ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`} onClick={() => { setJoinMode(false); setInviteCode(""); }}>Créer</button>
            <button className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${joinMode ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`} onClick={() => { setJoinMode(true); setClubName(""); setTeamName(""); }}>Rejoindre</button>
          </div>
          {joinMode ? (
            <div className="space-y-2">
              <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Code d'invitation" className="bg-white/10 border-white/20 text-white text-sm placeholder:text-white/40" />
              <div className="space-y-1">
                <Label className="text-white/60 text-xs">Votre rôle dans cette équipe</Label>
                <Select value={joinRole} onValueChange={(v) => v && setJoinRole(v as "player" | "coach" | "parent")}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player">Joueur</SelectItem>
                    <SelectItem value="coach">Coach</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-white border-white/20 hover:bg-white/10" onClick={() => { setShowTeamForm(false); setInviteCode(""); }}>Annuler</Button>
                <Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={handleJoinTeam} disabled={!inviteCode.trim() || submitting}>{submitting ? "..." : "Rejoindre"}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="Nom du club" className="bg-white/10 border-white/20 text-white text-sm placeholder:text-white/40" />
              <Input inputMode="numeric" value={fffNumber} onChange={(e) => setFffNumber(e.target.value)} placeholder="Numéro FFF (6 chiffres)" className="bg-white/10 border-white/20 text-white text-sm placeholder:text-white/40" />
              <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Nom de l'équipe" className="bg-white/10 border-white/20 text-white text-sm placeholder:text-white/40" />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-white border-white/20 hover:bg-white/10" onClick={() => { setShowTeamForm(false); setClubName(""); setTeamName(""); setFffNumber(""); }}>Annuler</Button>
                <Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={handleCreateTeam} disabled={!clubName.trim() || !teamName.trim() || submitting}>{submitting ? "..." : "Créer"}</Button>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      <nav className="py-3 px-2 space-y-0.5">
        {navItems
          .filter((item) => {
            if (item.coachOnly && !isCoach) return false;
            if ((item as { clubOnly?: boolean }).clubOnly && !hasClubRole) return false;
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
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {isCoach && (
        <>
          <div className="mx-2 border-t border-white/10" />
          <p className="px-4 py-1 text-xs font-semibold text-white/40 uppercase tracking-wider">
            Admin
          </p>
          <nav className="pb-3 px-2 space-y-0.5">
            {coachItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}

      <div className="border-t border-white/10 p-3">
        <Link
          href="/settings"
          onClick={close}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          Mon profil
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
        { href: "/club", label: "Espace club", icon: Building2 },
        { href: "/calendar", label: "Calendrier", icon: Calendar },
        { href: "/roster", label: "Effectif", icon: Users },
        { href: "/stats", label: "Stats", icon: BarChart3 },
      ]
    : [
        { href: "/", label: "Accueil", icon: LayoutDashboard },
        { href: "/calendar", label: "Calendrier", icon: Calendar },
        { href: "/roster", label: "Effectif", icon: Users },
        { href: "/chat", label: "Messagerie", icon: MessageSquare },
      ];

  return (
    <Sheet>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-white/10 bg-[var(--color-navy)] lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badge = item.href === "/chat" ? unreadChat : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                active
                  ? "text-[var(--color-gold)]"
                  : "text-white/40"
              }`}
            >
              {active && (
                <span className="absolute -top-px left-1/4 right-1/4 h-0.5 rounded-full bg-[var(--color-gold)]" />
              )}
              <span className="relative">
                <item.icon className="h-6 w-6" />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-gold)] px-1 text-[10px] font-semibold text-[var(--color-navy)]">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
        <SheetTrigger
          className="relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-white/40 transition-colors"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <MenuIcon className="h-6 w-6" />
          Menu
        </SheetTrigger>
      </nav>
      <SheetClose data-bottom-sheet-close className="hidden" />
      <SheetContentInner close={close} />
    </Sheet>
  );
}
