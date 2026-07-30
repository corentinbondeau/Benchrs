"use client";

import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
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
  UserCog,
  Wallet,
  ChevronsUpDown,
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
import { toast } from "sonner";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: Calendar },
  { href: "/roster", label: "Effectif", icon: Users },
  { href: "/stats", label: "Statistiques", icon: BarChart3 },
  { href: "/chat", label: "Messagerie", icon: MessageSquare },
  { href: "/medical", label: "Infirmerie", icon: Heart },
  { href: "/carpooling", label: "Covoiturage", icon: Car },
  { href: "/tasks", label: "Tâches", icon: ListTodo },
  { href: "/physical", label: "Prépa physique", icon: Medal, coachOnly: true },
  { href: "/tactics", label: "Tactique", icon: Swords, coachOnly: true },
  { href: "/gallery", label: "Galerie", icon: Image },
  { href: "/trophies", label: "Trophées", icon: Trophy },
  { href: "/championship", label: "Championnat", icon: Medal },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const coachItems = [
  { href: "/admin/players", label: "Gestion joueurs", icon: UserCog },
  { href: "/admin/cotisations", label: "Cotisations", icon: Wallet },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { currentTeam, teams, switchTeam, refreshTeams } = useTeam();
  const isCoach = user?.profile?.role === "coach";
  const [createOpen, setCreateOpen] = useState(false);
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreateTeam() {
    if (!clubName.trim() || !teamName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/auth/create-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user!.id, clubName: clubName.trim(), teamName: teamName.trim() }),
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
      await refreshTeams();
    } catch {
      toast.error("Erreur de connexion au serveur");
    }
    setCreating(false);
  }

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-[var(--color-navy)] text-white">
      <div className="flex h-14 items-center gap-2 px-4 border-b border-white/10">
        <img src="/logo.svg" alt="SportPlus" className="h-6 w-6" />
        <span className="text-lg font-bold">SportPlus</span>
      </div>

      {/* Team selector */}
      {currentTeam && (
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
              <Link href="/settings/team" className="text-white/40 hover:text-white shrink-0">
                <Settings2 className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{currentTeam.club?.name || currentTeam.name}</p>
                {currentTeam.club && (
                  <p className="text-xs text-white/50 truncate">{currentTeam.name}</p>
                )}
              </div>
              <Link href="/settings/team" className="text-white/40 hover:text-white shrink-0">
                <Settings2 className="h-5 w-5" />
              </Link>
              <ChevronsUpDown className="h-4 w-4 text-white/40 shrink-0" />
            </div>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<button className="block w-full mt-0.5 text-xs text-white/40 hover:text-white/60 text-center" />}>
              + Créer une équipe
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Créer une équipe</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom du club</Label>
                  <Input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="AS Monaco" />
                </div>
                <div className="space-y-2">
                  <Label>Nom de l&apos;équipe</Label>
                  <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="U17 Senior" />
                </div>
                <Button className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={handleCreateTeam} disabled={!clubName.trim() || !teamName.trim() || creating}>
                  {creating ? "Création..." : "Créer l'équipe"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems
          .filter((item) => !item.coachOnly || isCoach)
          .map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
