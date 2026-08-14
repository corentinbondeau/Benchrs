"use client";

import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { normalizeFffNumber } from "@/lib/clubs";
import { useChatUnread } from "@/lib/useChatUnread";
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
  Building2,
  CalendarRange,
  Trophy,
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
  { href: "/", label: "Accueil", icon: Home },
  { href: "/calendar", label: "Agenda", icon: Calendar },
  { href: "/roster", label: "Equipe", icon: Users },
  { href: "/stats", label: "Performance", icon: BarChart3 },
  { href: "/chat", label: "Messages", icon: MessageSquare },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { currentTeam, teams, switchTeam, userRole, clubMemberships } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const hasClubRole = clubMemberships.length > 0;
  const isComiteOnly = hasClubRole && userRole === null;
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
          </div>
        </div>
      )}

      {/* ─── Primary Navigation ─── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <div className="space-y-0.5">
          {primaryNav.map((item) => {
            const active = isActive(item.href);
            const badge = item.href === "/chat" ? unreadChat : 0;
            // Skip chat for comite-only users if needed
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

        {/* ─── Secondary: Season & Club ─── */}
        <div className="mt-6 pt-4 border-t border-white/[0.08]">
          <p className="px-3 mb-2 text-[10px] font-semibold text-white/30 uppercase tracking-widest">
            Saison
          </p>
          <Link
            href="/season"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
              isActive("/season")
                ? "bg-white/[0.12] text-white"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
            }`}
          >
            <CalendarRange className="h-[18px] w-[18px]" />
            Plan de saison
          </Link>

          {hasClubRole && (
            <Link
              href="/club"
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150 ${
                isActive("/club")
                  ? "bg-white/[0.12] text-white"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
              }`}
            >
              <Building2 className="h-[18px] w-[18px]" />
              Espace club
            </Link>
          )}
        </div>
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
