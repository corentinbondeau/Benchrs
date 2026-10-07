"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookUser,
  Search,
  Download,
  Users,
  UserCog,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import type { Profile, Team } from "@/types";

interface ChildRow {
  student_id: string;
  first_name: string;
  last_name: string;
  team_id: string;
}

interface FamilyRow {
  parent_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  children: ChildRow[];
}

interface StaffRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  team_id: string | null;
  is_committee: boolean;
}

export default function ClubAnnuairePage() {
  const { clubs, loading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [families, setFamilies] = useState<FamilyRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [tab, setTab] = useState<"familles" | "encadrement">("familles");
  const [search, setSearch] = useState("");

  const supabaseRef = useRef(createClient());
  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const load = useCallback(async (cid: string) => {
    const { data: teamsData } = await supabaseRef.current
      .from("teams")
      .select("id, name, color_primary")
      .eq("club_id", cid)
      .order("name", { ascending: true });
    const teamRows = (teamsData || []) as Team[];
    const teamIds = teamRows.map((t) => t.id);

    const [{ data: membersData }, { data: linksData }] = await Promise.all([
      teamIds.length
        ? supabaseRef.current
            .from("team_members")
            .select("user_id, team_id, role")
            .in("team_id", teamIds)
        : { data: [] as { user_id: string; team_id: string; role: string }[] },
      teamIds.length
        ? supabaseRef.current
            .from("parent_student")
            .select("parent_id, student_id, team_id")
            .in("team_id", teamIds)
        : { data: [] as { parent_id: string; student_id: string; team_id: string }[] },
    ]);
    const memberRows = (membersData || []) as { user_id: string; team_id: string; role: string }[];
    const linkRows = (linksData || []) as { parent_id: string; student_id: string; team_id: string }[];

    const userIds = [...new Set([...memberRows.map((m) => m.user_id), ...linkRows.map((l) => l.parent_id), ...linkRows.map((l) => l.student_id)])];
    let profiles: Profile[] = [];
    if (userIds.length > 0) {
      const { data } = await supabaseRef.current
        .from("profiles")
        .select("id, first_name, last_name, phone, role")
        .in("id", userIds);
      profiles = (data as Profile[]) || [];
    }
    const profById = new Map(profiles.map((p) => [p.id, p]));

    const parentIds = [...new Set(memberRows.filter((m) => m.role === "parent").map((m) => m.user_id))];
    const familyRows: FamilyRow[] = parentIds
      .map((pid) => {
        const p = profById.get(pid);
        if (!p) return null;
        return {
          parent_id: pid,
          first_name: p.first_name,
          last_name: p.last_name,
          phone: p.phone,
          children: linkRows
            .filter((l) => l.parent_id === pid)
            .map((l) => {
              const c = profById.get(l.student_id);
              return {
                student_id: l.student_id,
                first_name: c?.first_name ?? "?",
                last_name: c?.last_name ?? "?",
                team_id: l.team_id,
              };
            }),
        } satisfies FamilyRow;
      })
      .filter((r): r is FamilyRow => r !== null)
      .sort((a, b) => a.last_name.localeCompare(b.last_name));

    const staffRows: StaffRow[] = [];
    for (const m of memberRows) {
      if (m.role !== "coach" && m.role !== "owner") continue;
      const p = profById.get(m.user_id);
      if (!p) continue;
      staffRows.push({
        id: m.user_id,
        first_name: p.first_name,
        last_name: p.last_name,
        phone: p.phone,
        role: m.role === "owner" ? "coach" : m.role,
        team_id: m.team_id,
        is_committee: false,
      });
    }

    const { data: committeeRows } = await supabaseRef.current
      .from("club_members")
      .select("user_id, role, profile:profiles(id, first_name, last_name, phone)")
      .eq("club_id", cid);
    for (const row of (committeeRows || []) as {
      user_id: string;
      role: string;
      profile:
        | { id: string; first_name: string | null; last_name: string | null; phone: string | null }
        | { id: string; first_name: string | null; last_name: string | null; phone: string | null }[]
        | null;
    }[]) {
      const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      if (!prof) continue;
      staffRows.push({
        id: row.user_id,
        first_name: prof.first_name ?? "",
        last_name: prof.last_name ?? "",
        phone: prof.phone,
        role: "comité",
        team_id: null,
        is_committee: true,
      });
    }
    staffRows.sort((a, b) => a.last_name.localeCompare(b.last_name));

    return {
      teams: teamRows,
      families: familyRows,
      staff: staffRows,
    };
  }, []);

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setTeams(res.teams);
      setFamilies(res.families);
      setStaff(res.staff);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
  }

  const teamName = (tid: string) => teams.find((t) => t.id === tid)?.name ?? "";

  const q = search.trim().toLowerCase();
  const filteredFamilies = q
    ? families.filter((f) =>
        `${f.first_name} ${f.last_name} ${f.children.map((c) => `${c.first_name} ${c.last_name}`).join(" ")}`
          .toLowerCase()
          .includes(q)
      )
    : families;
  const filteredStaff = q
    ? staff.filter((s) => `${s.first_name} ${s.last_name} ${s.role}`.toLowerCase().includes(q))
    : staff;

  function csvCell(value: string | number | null | undefined): string {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    if (tab === "familles") {
      if (filteredFamilies.length === 0) return;
      const rows = ["Nom;Prénom;Téléphone;Enfant(s);Équipe(s)"];
      for (const f of filteredFamilies) {
        rows.push(
          [
            csvCell(f.last_name),
            csvCell(f.first_name),
            csvCell(f.phone),
            csvCell(f.children.map((c) => `${c.first_name} ${c.last_name}`).join(", ")),
            csvCell([...new Set(f.children.map((c) => teamName(c.team_id)))].join(", ")),
          ].join(";")
        );
      }
      const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `familles-${selectedClub?.name.replace(/\s+/g, "-").toLowerCase() ?? "club"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      if (filteredStaff.length === 0) return;
      const rows = ["Rôle;Nom;Prénom;Téléphone;Équipe"];
      for (const s of filteredStaff) {
        rows.push(
          [
            csvCell(s.is_committee ? s.role : "Coach / éducateur"),
            csvCell(s.last_name),
            csvCell(s.first_name),
            csvCell(s.phone),
            csvCell(s.team_id ? teamName(s.team_id) : "Comité du club"),
          ].join(";")
        );
      }
      const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `encadrement-${selectedClub?.name.replace(/\s+/g, "-").toLowerCase() ?? "club"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast.success("Export CSV généré");
  }

  if (!isCommittee) {
    return (
      <ClubPageShell
        title="Annuaire du club"
        clubs={clubs}
        clubId={clubId}
        onChangeClub={onChangeClub}
        loading={loading || (clubId ? pageLoading : false)}
      >
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Annuaire réservé au comité (données de contact).
          </CardContent>
        </Card>
      </ClubPageShell>
    );
  }

  return (
    <ClubPageShell
      title="Annuaire du club"
      subtitle="Familles et encadrement — accès comité"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={loading || (clubId ? pageLoading : false)}
      actions={
        <>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setTab("familles")}
              className={`px-3 py-1.5 text-xs font-medium ${
                tab === "familles" ? "bg-[var(--color-royal)] text-white" : "text-muted-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5 inline mr-1" />
              Familles
            </button>
            <button
              onClick={() => setTab("encadrement")}
              className={`px-3 py-1.5 text-xs font-medium ${
                tab === "encadrement"
                  ? "bg-[var(--color-royal)] text-white"
                  : "text-muted-foreground"
              }`}
            >
              <UserCog className="h-3.5 w-3.5 inline mr-1" />
              Encadrement
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5 mr-1" />
            CSV
          </Button>
        </>
      }
    >
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="pl-8 h-9"
        />
      </div>

      {tab === "familles" ? (
        filteredFamilies.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucune famille trouvée.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredFamilies.map((f) => (
              <Card key={f.parent_id}>
                <CardContent className="p-4">
                  <p className="font-medium text-sm flex items-center gap-1.5">
                    <BookUser className="h-4 w-4 text-[var(--color-royal)]" />
                    {f.first_name} {f.last_name}
                  </p>
                  {f.phone && (
                    <a
                      href={`tel:${f.phone}`}
                      className="text-sm text-[var(--color-royal)] flex items-center gap-1 mt-1"
                    >
                      <Phone className="h-3 w-3" />
                      {f.phone}
                    </a>
                  )}
                  {f.children.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                        Enfant(s)
                      </p>
                      {f.children.map((c) => (
                        <p key={c.student_id} className="text-sm flex items-center justify-between">
                          <span>{c.first_name} {c.last_name}</span>
                          {teamName(c.team_id) && (
                            <Badge variant="outline" className="text-[10px]">
                              {teamName(c.team_id)}
                            </Badge>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : filteredStaff.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucun membre de l&apos;encadrement trouvé.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredStaff.map((s) => (
            <Card key={`${s.id}-${s.team_id ?? "club"}-${s.is_committee}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm truncate">
                    {s.first_name} {s.last_name}
                  </p>
                  {s.is_committee ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Comité
                    </Badge>
                  ) : (
                    <Badge className="text-[10px]">Coach</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.team_id ? teamName(s.team_id) : "Comité du club"}
                </p>
                {s.phone && (
                  <a
                    href={`tel:${s.phone}`}
                    className="text-sm text-[var(--color-royal)] flex items-center gap-1 mt-1"
                  >
                    <Phone className="h-3 w-3" />
                    {s.phone}
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </ClubPageShell>
  );
}