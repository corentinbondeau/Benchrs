"use client";

import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { normalizeFffNumber } from "@/lib/clubs";
import { useChatUnread } from "@/lib/useChatUnread";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  BarChart3,
  MessageSquare,
  Heart,
  Car,
  ListTodo,
  Swords,
  Image,
  Trophy,
  Bell,
  Settings,
  Settings2,
  Medal,
  Dumbbell,
  UserCog,
  Wallet,
  ChevronsUpDown,
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
  MapPin,
  RefreshCw,
  TrendingDown,
  ClipboardList,
  PartyPopper,
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
import { toast } from "sonner";
import { useState } from "react";
import { useHiddenTabs } from "@/lib/tabs";

const navItems = [
  { key: "dashboard", href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { key: "calendar", href: "/calendar", label: "Calendrier", icon: Calendar },
  { key: "roster", href: "/roster", label: "Effectif", icon: Users },
  { key: "stats", href: "/stats", label: "Statistiques", icon: BarChart3 },
  { key: "chat", href: "/chat", label: "Messagerie", icon: MessageSquare },
  { key: "medical", href: "/medical", label: "Infirmerie", icon: Heart },
  { key: "carpooling", href: "/carpooling", label: "Covoiturage", icon: Car },
  { key: "tasks", href: "/tasks", label: "Tâches", icon: ListTodo },
  { key: "polls", href: "/polls", label: "Sondages", icon: Vote },
  { key: "physical", href: "/physical", label: "Prépa physique", icon: Dumbbell, coachOnly: true },
  { key: "tactics", href: "/tactics", label: "Tactique", icon: Swords, coachOnly: true },
  { key: "season", href: "/season", label: "Plan de saison", icon: CalendarRange },
  { key: "challenge", href: "/challenge", label: "Défi de la semaine", icon: Flame },
  { key: "club", href: "/club", label: "Espace club", icon: Building2, clubOnly: true },
  { key: "terrains", href: "/club/terrains", label: "Terrains", icon: MapPin, clubOnly: true },
  { key: "mutations", href: "/club/mutations", label: "Mutations", icon: RefreshCw, clubOnly: true },
  { key: "clubfeed", href: "/club/feed", label: "Fil du club", icon: Newspaper, clubTeamOnly: true },
  { key: "gallery", href: "/gallery", label: "Galerie", icon: Image },
  { key: "trophies", href: "/trophies", label: "Trophées", icon: Trophy },
  { key: "championship", href: "/championship", label: "Championnat", icon: Medal },
  { key: "material", href: "/material", label: "Matériel", icon: Package, coachAndClub: true },
  { key: "adversaires", href: "/adversaires", label: "Adversaires", icon: Flag },
  { key: "compare", href: "/stats/compare", label: "Comparer", icon: GitCompareArrows, coachOnly: true },
  { key: "drop", href: "/stats/drop", label: "Baisse de forme", icon: TrendingDown, coachOnly: true },
  { key: "tournament", href: "/tournament", label: "Tournois", icon: Trophy },
  { key: "cotisations", href: "/admin/cotisations", label: "Cotisations", icon: Wallet, clubOnly: true },
  { key: "treasury", href: "/admin/treasury", label: "Trésorerie", icon: PiggyBank, clubOnly: true },
  { key: "notifications", href: "/notifications", label: "Notifications", icon: Bell },
  { key: "meetings", href: "/meetings", label: "Réunions parents", icon: ClipboardList },
  { key: "cagnotte", href: "/cagnotte", label: "Cagnottes", icon: PiggyBank },
  { key: "fin-saison", href: "/fin-saison", label: "Fin de saison", icon: PartyPopper },
];

const comiteOnlyHrefs = new Set(["/club", "/club/feed", "/club/terrains", "/calendar", "/roster", "/stats", "/notifications", "/material", "/admin/cotisations", "/admin/treasury"]);

const coachItems = [
  { href: "/admin/players", label: "Gestion joueurs", icon: UserCog },
  { href: "/admin/deadlines", label: "Échéances", icon: CalendarClock },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
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
  const [joinRole, setJoinRole] = useState<"player" | "parent">("player");
  const [creating, setCreating] = useState(false);

  async function handleCreateTeam() {
    if (!clubName.trim() || !teamName.trim()) return;
    const fff = normalizeFffNumber(fffNumber);
    if (!fff) {
      toast.error("Numéro d'affiliation FFF invalide (6 chiffres requis)");
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
        toast.error(data.error || "Erreur lors de la création");
        setCreating(false);
        return;
      }
      toast.success(`Équipe créée ! Code d'invitation : ${data.inviteCode}`);
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
      toast.success(data.message || "Équipe rejointe !");
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

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[var(--color-navy)] text-white">
      <div className="flex h-12 items-center gap-2 px-4 border-b border-white/10">
        <img src="/logo.svg" alt="Benchrs" className="h-10 w-10" />
        <span className="text-2xl font-bold">Benchrs</span>
      </div>

      {/* Team selector */}
      {currentTeam && !isComiteOnly && (
        <div className="px-3 py-2 border-b border-white/10">
          {teams.length > 1 ? (
            <div className="flex items-center gap-2">
              <select
                value={currentTeam.id}
                onChange={(e) => switchTeam(e.target.value)}
                className="flex-1 bg-white/10 text-white text-sm rounded-lg px-3 py-2 appearance-none cursor-pointer hover:bg-white/15 transition-colors"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id} className="bg-[var(--color-navy)]">
                    {team.club?.name ? `${team.club.name} — ` : ""}{team.name}
                  </option>
                ))}
              </select>
              {!isComiteOnly && (
                <Link href="/settings/team" className="text-white/40 hover:text-white shrink-0">
                  <Settings2 className="h-5 w-5" />
                </Link>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{currentTeam.club?.name || currentTeam.name}</p>
                {currentTeam.club && (
                  <p className="text-xs text-white/50 truncate">{currentTeam.name}</p>
                )}
              </div>
              {!isComiteOnly && (
                <Link href="/settings/team" className="text-white/40 hover:text-white shrink-0">
                  <Settings2 className="h-5 w-5" />
                </Link>
              )}
              <ChevronsUpDown className="h-4 w-4 text-white/40 shrink-0" />
            </div>
          )}
          {!isComiteOnly && (
            <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setJoinMode(false); }}>
              <DialogTrigger render={<button className="block w-full mt-0.5 text-xs text-white/40 hover:text-white/60 text-center" />}>
                + Créer une équipe
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>{joinMode ? "Rejoindre une équipe" : "Créer une équipe"}</DialogTitle>
                </DialogHeader>
                <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30 mb-4">
                  <button className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!joinMode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setJoinMode(false); setInviteCode(""); }}>Créer</button>
                  <button className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${joinMode ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setJoinMode(true); setClubName(""); setTeamName(""); }}>Rejoindre</button>
                </div>
                {joinMode ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Code d&apos;invitation</Label>
                      <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Entrez le code" />
                    </div>
                    <div className="space-y-2">
                      <Label>Votre rôle dans cette équipe</Label>
                      <Select value={joinRole} onValueChange={(v) => v && setJoinRole(v as "player" | "parent")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="player">Joueur</SelectItem>
                          <SelectItem value="parent">Parent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={handleJoinTeam} disabled={!inviteCode.trim() || creating}>
                      {creating ? "Connexion..." : "Rejoindre l'équipe"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nom du club</Label>
                      <Input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="AS Monaco" />
                    </div>
                    <div className="space-y-2">
                      <Label>Numéro d&apos;affiliation FFF *</Label>
                      <Input inputMode="numeric" value={fffNumber} onChange={(e) => setFffNumber(e.target.value)} placeholder="501234" />
                    </div>
                    <div className="space-y-2">
                      <Label>Nom de l&apos;équipe</Label>
                      <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="U17 Senior" />
                    </div>
                    <Button className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={handleCreateTeam} disabled={!clubName.trim() || !teamName.trim() || creating}>
                      {creating ? "Création..." : "Créer l'équipe"}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems
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
          const badge = item.href === "/chat" ? unreadChat : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="relative">
                <item.icon className="h-4 w-4 shrink-0" />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-gold)] px-1 text-[10px] font-semibold text-[var(--color-navy)]">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}

        {isCoach && (
          <>
            <div className="my-3 border-t border-white/10" />
            <p className="px-3 py-1 text-xs font-semibold text-white/40 uppercase tracking-wider">
              Admin
            </p>
            {coachItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
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
          </>
        )}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
          Paramètres
        </Link>
      </div>
    </aside>
  );
}
