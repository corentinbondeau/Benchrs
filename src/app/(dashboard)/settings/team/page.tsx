"use client";

import { useState, useEffect, useCallback } from "react";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Activity,
  BadgeCheck,
  Building2,
  CalendarDays,
  Copy,
  Download,
  Flame,
  Link2,
  Loader2,
  Share2,
  RefreshCw,
  Users,
  Pencil,
  Trash2,
  Check,
  X,
  LogOut,
  Crown,
  LayoutDashboard,
  Clock,
  MapPin,
  Globe,
} from "lucide-react";
import { CHALLENGE_DIFFICULTIES, type ChallengeDifficulty } from "@/lib/challenges/ai-generator";
import { normalizeFffNumber } from "@/lib/clubs";
import { NAV_TABS } from "@/lib/tabs";
import type { TeamMember, Profile } from "@/types";
import type { TeamLocation } from "@/components/calendar/LocationPicker";

export default function TeamSettingsPage() {
  const { currentTeam, refreshTeams, switchTeam, teams, userRole } = useTeam();
  const { user } = useAuth();
  const [members, setMembers] = useState<
    (TeamMember & { profile?: Profile })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [colorPrimary, setColorPrimary] = useState("#EAB308");
  const [colorSecondary, setColorSecondary] = useState("#1E40AF");
  const [savingColors, setSavingColors] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>("moyen");
  const [savingDifficulty, setSavingDifficulty] = useState(false);
  const [enableRpe, setEnableRpe] = useState(false);
  const [savingRpe, setSavingRpe] = useState(false);
  const [minPlayingMinutes, setMinPlayingMinutes] = useState(0);
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [tabVisibility, setTabVisibility] = useState<Record<string, boolean>>({});
  const [savingTab, setSavingTab] = useState<string | null>(null);
  const [icsInfo, setIcsInfo] = useState<{
    webcalUrl: string;
    icsUrl: string;
    downloadUrl: string;
    teamName: string;
  } | null>(null);
  const [icsCopied, setIcsCopied] = useState(false);
  const [clubMembers, setClubMembers] = useState<
    { id: string; user_id: string; role: string; profile?: Profile }[]
  >([]);
  const [clubTeamsList, setClubTeamsList] = useState<{ id: string; name: string }[]>([]);
  const [canManageClub, setCanManageClub] = useState(false);
  const [comiteInviteCode, setComiteInviteCode] = useState("");
  const [comiteCodeCopied, setComiteCodeCopied] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [clubIdentity, setClubIdentity] = useState<{
    name: string;
    fff_number: string | null;
  } | null>(null);
  const [clubPublic, setClubPublic] = useState<{
    is_public: boolean;
    public_slug: string | null;
    description: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null>(null);
  const [clubAliases, setClubAliases] = useState<{ id: string; alias: string }[]>([]);
  const [fffInput, setFffInput] = useState("");
  const [publicSlugInput, setPublicSlugInput] = useState("");
  const [publicDescInput, setPublicDescInput] = useState("");
  const [publicEmailInput, setPublicEmailInput] = useState("");
  const [publicPhoneInput, setPublicPhoneInput] = useState("");
  const [savingPublic, setSavingPublic] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [savingFff, setSavingFff] = useState(false);
  const [addingAlias, setAddingAlias] = useState(false);
  const [savedLocations, setSavedLocations] = useState<TeamLocation[]>([]);
  const supabase = createClient();

  const isOwner = members.some(
    (m) => m.user_id === user?.id && m.role === "owner"
  );
  const isCoach = userRole === "coach" || userRole === "owner";

  const fetchMembers = useCallback(async (teamId: string) => {
    const supabase = createClient();
    const { data: rows } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId);

    if (!rows || rows.length === 0) return [];

    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      profile: profileMap.get(r.user_id),
    }));
  }, []);

  const loadClubData = useCallback(
    async (clubId: string) => {
      const supabase = createClient();
      const [membersRes, teamsRes, presidentRes, clubRes] = await Promise.all([
        supabase.from("club_members").select("id, user_id, role").eq("club_id", clubId),
        supabase.from("teams").select("id, name").eq("club_id", clubId),
        supabase
          .from("club_members")
          .select("id")
          .eq("club_id", clubId)
          .eq("user_id", user?.id ?? "")
          .eq("role", "president")
          .maybeSingle(),
        supabase.from("clubs").select("created_by").eq("id", clubId).maybeSingle(),
      ]);

      const rows = membersRes.data || [];
      const userIds = rows.map((r) => r.user_id as string);
      const profilesRes = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", userIds)
        : { data: [] };
      const profileMap = new Map(
        ((profilesRes.data as Profile[]) || []).map((p) => [p.id, p])
      );

      return {
        members: rows.map((r) => ({ ...r, profile: profileMap.get(r.user_id as string) })),
        teams: teamsRes.data || [],
        canManage: !!presidentRes.data || clubRes.data?.created_by === user?.id,
      };
    },
    [user?.id]
  );

  const loadClubIdentity = useCallback(async (clubId: string) => {
    const supabase = createClient();
    const [clubRes, aliasesRes] = await Promise.all([
      supabase
        .from("clubs")
        .select("id, name, fff_number, is_public, public_slug, description, contact_email, contact_phone")
        .eq("id", clubId)
        .maybeSingle(),
      supabase.from("club_aliases").select("id, alias").eq("club_id", clubId).order("alias"),
    ]);
    return {
      club: clubRes.data ?? null,
      aliases: aliasesRes.data || [],
    };
  }, []);

  const fetchInviteCode = useCallback(async (clubId: string) => {
    const res = await authFetch("/api/clubs/invite-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.inviteCode as string) ?? null;
  }, []);

  useEffect(() => {
    if (!currentTeam) return;

    const team = currentTeam;
    const supabase = createClient();

    fetchMembers(team.id).then((rows) => {
      setMembers(rows);
      setLoading(false);
      setNewName(team.name);
      setColorPrimary(team.color_primary || "#EAB308");
      setColorSecondary(team.color_secondary || "#1E40AF");
    });

    supabase
      .from("weekly_challenge_settings")
      .select("difficulty")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.difficulty) {
          setDifficulty(data.difficulty as ChallengeDifficulty);
        }
      });

    supabase
      .from("team_settings")
      .select("enable_rpe, min_playing_minutes")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => {
        setEnableRpe(data?.enable_rpe === true);
        setMinPlayingMinutes(data?.min_playing_minutes ?? 0);
      });

    supabase
      .from("team_tab_visibility")
      .select("tab_key, visible")
      .eq("team_id", team.id)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        for (const t of NAV_TABS) map[t.key] = true;
        for (const row of (data ?? []) as { tab_key: string; visible: boolean }[]) {
          map[row.tab_key] = row.visible;
        }
        setTabVisibility(map);
      });

    supabase
      .from("team_locations")
      .select("id, team_id, name, address, created_by, created_at")
      .eq("team_id", team.id)
      .order("name", { ascending: true })
      .then(({ data }) => {
        setSavedLocations((data || []) as TeamLocation[]);
      });

    if (userRole === "coach" || userRole === "owner") {
      authFetch(`/api/calendar/url?teamId=${team.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.webcalUrl) setIcsInfo(d);
        })
        .catch(() => {
          /* lien calendrier indisponible */
        });
    }

    if (team.club_id) {
      loadClubData(team.club_id).then(({ members, teams: t, canManage }) => {
        setClubMembers(members);
        setClubTeamsList(t);
        setCanManageClub(canManage);
        if (canManage) {
          fetchInviteCode(team.club_id!).then((code) => {
            if (code) setComiteInviteCode(code);
          });
        }
      });
      loadClubIdentity(team.club_id).then(({ club, aliases }) => {
        setClubIdentity(club);
        setClubAliases(aliases);
        setFffInput(club?.fff_number ?? "");
        setClubPublic(
          club
            ? {
                is_public: Boolean((club as unknown as { is_public?: boolean }).is_public),
                public_slug: (club as unknown as { public_slug?: string | null }).public_slug ?? null,
                description: (club as unknown as { description?: string | null }).description ?? null,
                contact_email: (club as unknown as { contact_email?: string | null }).contact_email ?? null,
                contact_phone: (club as unknown as { contact_phone?: string | null }).contact_phone ?? null,
              }
            : null
        );
        setPublicSlugInput((club as unknown as { public_slug?: string | null }).public_slug ?? "");
        setPublicDescInput((club as unknown as { description?: string | null }).description ?? "");
        setPublicEmailInput((club as unknown as { contact_email?: string | null }).contact_email ?? "");
        setPublicPhoneInput((club as unknown as { contact_phone?: string | null }).contact_phone ?? "");
      });
    }
  }, [currentTeam, fetchMembers, userRole, loadClubData, loadClubIdentity, fetchInviteCode]);

  async function toggleTabVisibility(key: string, visible: boolean) {
    if (!currentTeam) return;
    setTabVisibility((prev) => ({ ...prev, [key]: visible }));
    setSavingTab(key);
    const { error } = await supabase
      .from("team_tab_visibility")
      .upsert(
        { team_id: currentTeam.id, tab_key: key, visible },
        { onConflict: "team_id,tab_key" }
      );
    setSavingTab(null);
    if (error) {
      toast.error("Erreur lors de l'enregistrement");
      setTabVisibility((prev) => ({ ...prev, [key]: !visible }));
      return;
    }
    toast.success(visible ? "Onglet affiché" : "Onglet masqué");
  }

  async function regenerateCode() {
    if (!currentTeam) return;

    const newCode = Array.from({ length: 12 }, () =>
      Math.random().toString(36).charAt(2)
    ).join("");

    const { error } = await supabase
      .from("teams")
      .update({ invite_code: newCode })
      .eq("id", currentTeam!.id);

    if (error) {
      toast.error("Erreur lors de la régénération du code");
    } else {
      await refreshTeams();
      toast.success("Nouveau code généré !");
    }
  }

  function copyCode() {
    if (!currentTeam) return;
    navigator.clipboard.writeText(currentTeam.invite_code);
    setCopied(true);
    toast.success("Code copié !");
    setTimeout(() => setCopied(false), 2000);
  }

  function inviteLink() {
    if (!currentTeam) return "";
    return `${window.location.origin}/join?code=${currentTeam.invite_code}`;
  }

  function copyInviteLink() {
    if (!currentTeam) return;
    navigator.clipboard.writeText(inviteLink());
    setCopied(true);
    toast.success("Lien d'invitation copié !");
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareInviteLink() {
    if (!currentTeam) return;
    const text = `Rejoins mon équipe ${currentTeam.name} sur Benchrs : ${inviteLink()}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Invitation Benchrs", text });
        return;
      } catch {
        // fallback sur copie si partage annulé/indisponible
      }
    }
    copyInviteLink();
  }

  async function saveTeamName() {
    if (!currentTeam || !newName.trim()) return;

    const { error } = await supabase
      .from("teams")
      .update({ name: newName.trim() })
      .eq("id", currentTeam!.id);

    if (error) {
      toast.error("Erreur lors de la mise à jour");
    } else {
      await refreshTeams();
      setEditingName(false);
      toast.success("Nom mis à jour !");
    }
  }

  async function saveColors() {
    if (!currentTeam) return;
    setSavingColors(true);

    const { error } = await supabase
      .from("teams")
      .update({ color_primary: colorPrimary, color_secondary: colorSecondary })
      .eq("id", currentTeam!.id);

    if (error) {
      toast.error("Erreur lors de la sauvegarde des couleurs");
    } else {
      await refreshTeams();
      toast.success("Couleurs mises à jour !");
    }
    setSavingColors(false);
  }

  async function uploadBranding(file: File, kind: "logo" | "banner") {
    if (!currentTeam) return;
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
    const column = kind === "logo" ? "logo_url" : "banner_url";
    const { error } = await supabase.from("teams").update({ [column]: null }).eq("id", currentTeam.id);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    await refreshTeams();
    toast.success(kind === "logo" ? "Logo supprimé" : "Bannière supprimée");
  }

  async function deleteTeam() {
    if (!currentTeam) return;
    setDeleting(true);

    const res = await authFetch("/api/teams/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: currentTeam.id }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || "Erreur lors de la suppression");
      setDeleting(false);
      return;
    }

    toast.success("Équipe supprimée");
    await refreshTeams();

    if (teams.length > 1) {
      const remaining = teams.filter((t) => t.id !== currentTeam.id);
      switchTeam(remaining[0].id);
      window.location.href = "/settings/team";
    } else {
      window.location.href = "/create-team";
    }
  }

  async function removeMember(memberId: string, memberName: string) {
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast.error("Erreur lors de la expulsion");
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success(`${memberName} a été retiré de l'équipe`);
    }
  }

  async function transferOwnership(memberId: string, memberName: string) {
    if (!currentTeam) return;
    const ok = window.confirm(
      `Transférer la propriété de l'équipe à ${memberName} ? Vous deviendrez coach.`
    );
    if (!ok) return;

    const res = await authFetch("/api/teams/transfer-ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: currentTeam.id, newOwnerId: memberId }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || "Erreur lors du transfert");
      return;
    }

    toast.success(`Propriété transférée à ${memberName}`);
    await refreshTeams();
    if (currentTeam) {
      const rows = await fetchMembers(currentTeam.id);
      setMembers(rows);
      setLoading(false);
    }
  }

  async function refreshClubData() {
    if (!currentTeam?.club_id) return;
    const data = await loadClubData(currentTeam.club_id);
    setClubMembers(data.members);
    setClubTeamsList(data.teams);
    setCanManageClub(data.canManage);
    if (data.canManage) {
      const code = await fetchInviteCode(currentTeam.club_id);
      if (code) setComiteInviteCode(code);
    }
  }

  async function regenerateInviteCode() {
    if (!currentTeam?.club_id || !comiteInviteCode) return;
    setRegeneratingCode(true);
    const res = await authFetch("/api/clubs/invite-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, regenerate: true }),
    });
    setRegeneratingCode(false);
    if (res.ok) {
      const data = await res.json();
      setComiteInviteCode(data.inviteCode ?? "");
      toast.success("Code d'invitation régénéré");
    } else {
      toast.error("Erreur lors de la régénération du code");
    }
  }

  async function copyInviteCode() {
    if (!comiteInviteCode) return;
    await navigator.clipboard.writeText(comiteInviteCode);
    setComiteCodeCopied(true);
    setTimeout(() => setComiteCodeCopied(false), 2000);
  }

  async function addClubMember() {
    if (!currentTeam?.club_id || !newMemberEmail.trim()) return;
    setAddingMember(true);
    const res = await authFetch("/api/clubs/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clubId: currentTeam.club_id,
        email: newMemberEmail.trim(),
        role: "comite",
      }),
    });
    const data = await res.json();
    setAddingMember(false);
    if (!res.ok) {
      toast.error(data.error || "Erreur lors de l'ajout");
      return;
    }
    setNewMemberEmail("");
    toast.success("Membre du comité ajouté");
    await refreshClubData();
  }

  async function removeClubMember(userId: string) {
    if (!currentTeam?.club_id) return;
    const res = await authFetch("/api/clubs/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erreur lors du retrait");
      return;
    }
    toast.success("Membre retiré du comité");
    await refreshClubData();
  }

  async function changeClubMemberRole(userId: string, role: "president" | "comite") {
    if (!currentTeam?.club_id) return;
    const res = await authFetch("/api/clubs/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, userId, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erreur lors du changement de rôle");
      return;
    }
    toast.success(role === "president" ? "Promu président" : "Rétrogradé en comité");
    await refreshClubData();
  }

  async function saveFffNumber() {
    if (!currentTeam?.club_id) return;
    const fff = normalizeFffNumber(fffInput);
    if (!fff) {
      toast.error("Numéro d'affiliation FFF invalide (6 chiffres requis)");
      return;
    }
    setSavingFff(true);
    const res = await authFetch("/api/clubs/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, fffNumber: fff }),
    });
    const data = await res.json();
    setSavingFff(false);
    if (!res.ok) {
      toast.error(data.error || "Erreur lors de l'enregistrement");
      return;
    }
    toast.success("Numéro d'affiliation FFF enregistré");
    setClubIdentity((prev) => (prev ? { ...prev, fff_number: fff } : prev));
  }

  async function addAlias() {
    if (!currentTeam?.club_id || !aliasInput.trim()) return;
    setAddingAlias(true);
    const res = await authFetch("/api/clubs/aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, alias: aliasInput.trim() }),
    });
    const data = await res.json();
    setAddingAlias(false);
    if (!res.ok) {
      toast.error(data.error || "Erreur lors de l'ajout");
      return;
    }
    setAliasInput("");
    toast.success("Alias ajouté");
    await refreshClubIdentity();
  }

  async function removeAlias(alias: string) {
    if (!currentTeam?.club_id) return;
    const res = await authFetch("/api/clubs/aliases", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, alias }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Erreur lors de la suppression");
      return;
    }
    toast.success("Alias supprimé");
    await refreshClubIdentity();
  }

  async function refreshClubIdentity() {
    if (!currentTeam?.club_id) return;
    const { club, aliases } = await loadClubIdentity(currentTeam.club_id);
    setClubIdentity(club);
    setClubAliases(aliases);
    setClubPublic(
      club
        ? {
            is_public: Boolean((club as unknown as { is_public?: boolean }).is_public),
            public_slug: (club as unknown as { public_slug?: string | null }).public_slug ?? null,
            description: (club as unknown as { description?: string | null }).description ?? null,
            contact_email: (club as unknown as { contact_email?: string | null }).contact_email ?? null,
            contact_phone: (club as unknown as { contact_phone?: string | null }).contact_phone ?? null,
          }
        : null
    );
  }

  async function savePublicClub() {
    if (!currentTeam?.club_id) return;
    setSavingPublic(true);
    try {
      const slug = publicSlugInput
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const { error } = await supabase
        .from("clubs")
        .update({
          is_public: true,
          public_slug: slug || null,
          description: publicDescInput.trim() || null,
          contact_email: publicEmailInput.trim() || null,
          contact_phone: publicPhoneInput.trim() || null,
        })
        .eq("id", currentTeam.club_id);
      if (error) throw error;
      setClubPublic((prev) => ({
        ...prev,
        is_public: true,
        public_slug: slug || null,
        description: publicDescInput.trim() || null,
        contact_email: publicEmailInput.trim() || null,
        contact_phone: publicPhoneInput.trim() || null,
      }));
      toast.success("Page publique mise à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPublic(false);
    }
  }

  async function disablePublicClub() {
    if (!currentTeam?.club_id) return;
    const { error } = await supabase
      .from("clubs")
      .update({ is_public: false })
      .eq("id", currentTeam.club_id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setClubPublic((prev) => (prev ? { ...prev, is_public: false } : prev));
    toast.success("Page publique masquée");
  }

  async function leaveTeam() {
    if (!currentTeam) return;
    setLeaving(true);

    const res = await authFetch("/api/team/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: currentTeam.id }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || "Erreur lors de la sortie de l'équipe");
      setLeaving(false);
      return;
    }

    toast.success("Vous avez quitté l'équipe");
    await refreshTeams();

    if (teams.length > 1) {
      const remaining = teams.filter((t) => t.id !== currentTeam.id);
      switchTeam(remaining[0].id);
      window.location.href = "/";
    } else {
      window.location.href = "/create-team";
    }
  }

  if (!currentTeam) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Aucune équipe sélectionnée</p>
            <a
              href="/create-team"
              className="text-sm text-[var(--color-royal)] hover:underline mt-2 inline-block"
            >
              Créer une équipe
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto section-gap">
      <h1 className="text-2xl font-bold">Paramètres d&apos;équipe</h1>

      {/* Team Info + Invite Code */}
      <Card>
        <CardHeader>
          <CardTitle>{currentTeam.club?.name || "Club"}</CardTitle>
          <CardDescription>
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTeamName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNewName(currentTeam.name);
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={saveTeamName}
                >
                  <Check className="h-4 w-4 text-green-500" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditingName(false);
                    setNewName(currentTeam.name);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <span className="flex items-center gap-2">
                {currentTeam.name}
                {isOwner && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setEditingName(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Lien d&apos;invitation</Label>
            <div className="flex gap-2">
              <Input
                value={inviteLink()}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={copyInviteLink}>
                <Copy
                  className={`h-4 w-4 ${copied ? "text-green-500" : ""}`}
                />
              </Button>
              <Button variant="outline" size="icon" onClick={shareInviteLink}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={copyInviteLink}
            >
              <Link2 className="h-4 w-4 mr-1" />
              {copied ? "Lien copié !" : "Copier le lien d'invitation"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Partagez ce lien pour que les joueurs rejoignent l&apos;équipe en
              un clic, plus besoin de saisir le code à la main.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Code d&apos;invitation</Label>
            <div className="flex gap-2">
              <Input
                value={currentTeam.invite_code}
                readOnly
                className="font-mono text-lg"
              />
              <Button variant="outline" size="icon" onClick={copyCode}>
                <Copy className="h-4 w-4" />
              </Button>
              {isOwner && (
                <Button variant="outline" size="icon" onClick={regenerateCode}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Code alternatif à saisir manuellement sur la page de rejointe
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Personnalisation</CardTitle>
            <CardDescription>
              Configurez les couleurs de l&apos;interface pour toute
              l&apos;équipe
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Couleur principale</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colorPrimary}
                    onChange={(e) => setColorPrimary(e.target.value)}
                    className="h-10 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={colorPrimary}
                    onChange={(e) => setColorPrimary(e.target.value)}
                    className="font-mono h-10"
                    maxLength={7}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Boutons CTA, highlights
                </p>
              </div>
              <div className="space-y-2">
                <Label>Couleur secondaire</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colorSecondary}
                    onChange={(e) => setColorSecondary(e.target.value)}
                    className="h-10 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={colorSecondary}
                    onChange={(e) => setColorSecondary(e.target.value)}
                    className="font-mono h-10"
                    maxLength={7}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Sidebar, accents, liens
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={saveColors}
                disabled={savingColors}
                className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              >
                {savingColors ? "Sauvegarde..." : "Sauvegarder les couleurs"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setColorPrimary("#EAB308");
                  setColorSecondary("#1E40AF");
                }}
              >
                Réinitialiser
              </Button>
            </div>
            <div className="rounded-lg border p-3 flex items-center gap-4 bg-muted/50">
              <div
                className="h-10 w-10 rounded-lg"
                style={{ backgroundColor: colorPrimary }}
              />
              <div
                className="h-10 w-10 rounded-lg"
                style={{ backgroundColor: colorSecondary }}
              />
              <span className="text-sm text-muted-foreground">Aperçu</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logo & bannière */}
      {isCoach && (
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
      )}

      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5" />
              Défi de la semaine
            </CardTitle>
            <CardDescription>
              Difficulté du défi généré automatiquement chaque semaine par IA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1 rounded-lg border p-0.5 w-fit">
              {CHALLENGE_DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    difficulty === d
                      ? "bg-[var(--color-navy)] text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              disabled={savingDifficulty}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingDifficulty(true);
                const { error } = await supabase
                  .from("weekly_challenge_settings")
                  .upsert(
                    {
                      team_id: currentTeam.id,
                      difficulty,
                      updated_by: user?.id ?? null,
                    },
                    { onConflict: "team_id" }
                  );
                setSavingDifficulty(false);
                if (error) {
                  toast.error("Erreur lors de l'enregistrement");
                } else {
                  toast.success("Difficulté mise à jour");
                }
              }}
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Suivi de charge (RPE)
            </CardTitle>
            <CardDescription>
              Les joueurs notent l&apos;intensité perçue (1-10) après chaque séance pour suivre la
              charge d&apos;entraînement et prévenir les blessures.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Activer le suivi</p>
                <p className="text-xs text-muted-foreground">
                  Affiche la carte « Suivi de charge » sur les fiches d&apos;entraînement.
                </p>
              </div>
              <Switch
                checked={enableRpe}
                onCheckedChange={(v) => setEnableRpe(v === true)}
              />
            </div>
            <Button
              size="sm"
              disabled={savingRpe}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingRpe(true);
                const { error } = await supabase
                  .from("team_settings")
                  .upsert(
                    {
                      team_id: currentTeam.id,
                      enable_rpe: enableRpe,
                      updated_by: user?.id ?? null,
                    },
                    { onConflict: "team_id" }
                  );
                setSavingRpe(false);
                if (error) {
                  toast.error("Erreur lors de l'enregistrement");
                } else {
                  toast.success("Paramètre enregistré");
                }
              }}
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Temps de jeu minimum (équité) */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Équité du temps de jeu
            </CardTitle>
            <CardDescription>
              Définissez un objectif de minutes minimum sur la saison. Les joueurs en dessous
              sont mis en évidence dans les statistiques et une alerte hebdomadaire est envoyée
              aux coachs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={6000}
                step={30}
                value={minPlayingMinutes}
                onChange={(e) => setMinPlayingMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0 = désactivé"
              />
              <span className="text-sm text-muted-foreground shrink-0">minutes / saison</span>
            </div>
            <Button
              size="sm"
              disabled={savingMinutes}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingMinutes(true);
                const { error } = await supabase
                  .from("team_settings")
                  .upsert(
                    {
                      team_id: currentTeam.id,
                      min_playing_minutes: minPlayingMinutes,
                      updated_by: user?.id ?? null,
                    },
                    { onConflict: "team_id" }
                  );
                setSavingMinutes(false);
                if (error) {
                  toast.error("Erreur lors de l'enregistrement");
                } else {
                  toast.success("Paramètre enregistré");
                }
              }}
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Navigation de l'équipe */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" />
              Navigation de l&apos;équipe
            </CardTitle>
            <CardDescription>
              Choisissez les onglets visibles par toute l&apos;équipe. Les pages masquées
              disparaissent du menu (elles restent accessibles par lien direct).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {NAV_TABS.map((tab) => {
              const visible = tabVisibility[tab.key] ?? true;
              return (
                <div
                  key={tab.key}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{tab.label}</p>
                    <p className="text-xs text-muted-foreground">{tab.href}</p>
                  </div>
                  <Switch
                    checked={visible}
                    disabled={savingTab === tab.key}
                    onCheckedChange={(v) => toggleTabVisibility(tab.key, v === true)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Synchronisation calendrier */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Synchronisation calendrier
            </CardTitle>
            <CardDescription>
              Abonnez-vous au calendrier de l&apos;équipe dans Google Calendar ou Apple Calendar :
              les matchs et entraînements apparaissent automatiquement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!icsInfo ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du lien...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Lien d&apos;abonnement (webcal)</Label>
                  <div className="flex gap-2">
                    <Input value={icsInfo.webcalUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(icsInfo.webcalUrl);
                          setIcsCopied(true);
                          setTimeout(() => setIcsCopied(false), 1500);
                        } catch {
                          toast.error("Copie impossible");
                        }
                      }}
                    >
                      <Copy className={`h-4 w-4 ${icsCopied ? "text-green-500" : ""}`} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            text: `Abonnez-vous au calendrier de ${icsInfo.teamName} (Benchrs)`,
                            url: icsInfo.webcalUrl,
                          });
                        } catch {
                          /* partage annulé */
                        }
                      } else {
                        window.open(icsInfo.webcalUrl, "_blank");
                      }
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5 mr-1" />
                    Partager
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(icsInfo.downloadUrl, "_blank")}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Télécharger .ics
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Google Calendar : Paramètres → Ajouter depuis une URL puis collez le lien.
                  Apple Calendar : Fichier → Nouvel abonnement au calendrier.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lieux enregistrés */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Lieux enregistrés
            </CardTitle>
            <CardDescription>
              Les lieux enregistrés sont réutilisables dans le calendrier lors de la
              création d&apos;événements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Lieux enregistrés ({savedLocations.length})</Label>
              {savedLocations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun lieu enregistré pour l&apos;instant. Enregistrez un lieu depuis le
                  calendrier pour le retrouver ici.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {savedLocations.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{l.address}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={async () => {
                          const supabase = createClient();
                          const { error } = await supabase
                            .from("team_locations")
                            .delete()
                            .eq("id", l.id);
                          if (error) {
                            toast.error("Impossible de supprimer le lieu");
                            return;
                          }
                          setSavedLocations((prev) => prev.filter((x) => x.id !== l.id));
                          toast.success("Lieu supprimé");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Membres ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement...</p>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun membre</p>
          ) : (
            <div className="divide-y">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-[var(--color-royal)] text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {member.profile?.first_name?.[0]}
                      {member.profile?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {member.profile?.first_name}{" "}
                        {member.profile?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {member.role}
                        {member.user_id === user?.id && " (vous)"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-muted px-2 py-1 rounded-full capitalize">
                      {member.role}
                    </span>
                    {isOwner &&
                      member.user_id !== user?.id &&
                      member.role !== "owner" && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[var(--color-gold)] hover:text-[var(--color-gold)]"
                            title="Transférer la propriété"
                            onClick={() =>
                              transferOwnership(
                                member.user_id,
                                `${member.profile?.first_name} ${member.profile?.last_name}`
                              )
                            }
                          >
                            <Crown className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Retirer de l'équipe"
                            onClick={() =>
                              removeMember(
                                member.id,
                                `${member.profile?.first_name} ${member.profile?.last_name}`
                              )
                            }
                          >
                            <LogOut className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Identité du club */}
      {currentTeam.club_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5" />
              Identité du club
            </CardTitle>
            <CardDescription>
              Le numéro d&apos;affiliation FFF est la clé unique du club (6 chiffres) :
              deux équipes d&apos;un même club ne peuvent pas créer un doublon.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Numéro d&apos;affiliation FFF</Label>
              <div className="flex gap-2">
                <Input
                  value={fffInput}
                  onChange={(e) => setFffInput(e.target.value)}
                  placeholder="501234"
                  inputMode="numeric"
                  className="h-9 font-mono text-sm"
                  disabled={!canManageClub}
                />
                {canManageClub && (
                  <Button
                    size="sm"
                    className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold h-9"
                    disabled={savingFff}
                    onClick={saveFffNumber}
                  >
                    {savingFff ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : clubIdentity?.fff_number ? (
                      "Modifier"
                    ) : (
                      "Enregistrer"
                    )}
                  </Button>
                )}
              </div>
              {clubIdentity?.fff_number ? (
                <p className="text-xs text-muted-foreground">
                  Club enregistré sous le numéro {clubIdentity.fff_number}
                </p>
              ) : canManageClub ? (
                <p className="text-xs text-muted-foreground">
                  Attribuez votre numéro FFF pour éviter les doublons de club.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Numéro non renseigné — demandez au président du club de le définir.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">
                Autres façons d&apos;écrire le nom ({clubAliases.length})
              </Label>
              {clubAliases.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun alias. Ajoutez les variantes du nom (ex. « ECC », « Etoile
                  Camphin ») pour retrouver le club.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {clubAliases.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-full"
                    >
                      {a.alias}
                      {canManageClub && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          title="Supprimer"
                          onClick={() => removeAlias(a.alias)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {canManageClub && (
                <div className="flex gap-2">
                  <Input
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    placeholder="ECC"
                    className="h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={addingAlias || !aliasInput.trim()}
                    onClick={addAlias}
                  >
                    {addingAlias ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Ajouter"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Page publique du club */}
      {currentTeam.club_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Page publique du club
            </CardTitle>
            <CardDescription>
              Une vitrine publique avec formulaire de demande d&apos;essai,
              partageable aux nouvelles familles (lien /c/&lt;slug&gt;).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Adresse de la page</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/c/</span>
                <Input
                  value={publicSlugInput}
                  onChange={(e) => setPublicSlugInput(e.target.value)}
                  placeholder="ecc-camphin"
                  className="h-9 font-mono text-sm"
                  disabled={!canManageClub}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description du club</Label>
              <Textarea
                value={publicDescInput}
                onChange={(e) => setPublicDescInput(e.target.value)}
                className="text-sm"
                rows={2}
                disabled={!canManageClub}
                placeholder="Valeurs du club, équipes, encadrement, projets..."
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Email de contact</Label>
                <Input
                  value={publicEmailInput}
                  onChange={(e) => setPublicEmailInput(e.target.value)}
                  className="h-9 text-sm"
                  disabled={!canManageClub}
                  placeholder="contact@club.fr"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Téléphone de contact</Label>
                <Input
                  value={publicPhoneInput}
                  onChange={(e) => setPublicPhoneInput(e.target.value)}
                  className="h-9 text-sm"
                  disabled={!canManageClub}
                  placeholder="06 12 34 56 78"
                />
              </div>
            </div>

            {clubPublic?.is_public && clubPublic.public_slug && (
              <div className="rounded-lg bg-muted px-3 py-2 text-xs">
                <p className="font-semibold text-sm">Page en ligne</p>
                <p className="text-muted-foreground mt-0.5 break-all">
                  {`${typeof window !== "undefined" ? window.location.origin : ""}/c/${clubPublic.public_slug}`}
                </p>
              </div>
            )}

            {canManageClub && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                  disabled={savingPublic}
                  onClick={savePublicClub}
                >
                  {savingPublic ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : clubPublic?.is_public ? (
                    "Mettre à jour"
                  ) : (
                    "Activer la page"
                  )}
                </Button>
                {clubPublic?.is_public && (
                  <Button size="sm" variant="outline" onClick={disablePublicClub}>
                    Masquer
                  </Button>
                )}
              </div>
            )}
            {!canManageClub && (
              <p className="text-xs text-muted-foreground">
                Seul le président du club peut gérer la page publique.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comité du club */}
      {currentTeam.club_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {currentTeam.club?.name || "Club"}
            </CardTitle>
            <CardDescription>
              {clubTeamsList.length > 0
                ? `Comité : ${clubTeamsList.length} équipe(s) dans le club (visibilité en lecture seule)`
                : "Comité du club"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {clubTeamsList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {clubTeamsList.map((t) => (
                  <span
                    key={t.id}
                    className="text-xs bg-muted px-2 py-1 rounded-full"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">
                Comité ({clubMembers.length})
              </Label>
              {clubMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun membre du comité
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {clubMembers.map((cm) => (
                    <div
                      key={cm.id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {cm.profile?.first_name} {cm.profile?.last_name}
                        </span>
                        {cm.user_id === user?.id && (
                          <span className="text-xs text-muted-foreground">
                            (vous)
                          </span>
                        )}
                        {cm.role === "president" ? (
                          <span
                            className="flex items-center gap-1 text-xs text-[var(--color-gold)] font-medium"
                            title="Président"
                          >
                            <Crown className="h-3.5 w-3.5" />
                            Président
                          </span>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            Comité
                          </Badge>
                        )}
                      </div>
                      {canManageClub && cm.user_id !== user?.id && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[var(--color-gold)]"
                            title={
                              cm.role === "president"
                                ? "Rétrograder en comité"
                                : "Promouvoir président"
                            }
                            onClick={() =>
                              changeClubMemberRole(
                                cm.user_id,
                                cm.role === "president" ? "comite" : "president"
                              )
                            }
                          >
                            <Crown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Retirer du comité"
                            onClick={() => removeClubMember(cm.user_id)}
                          >
                            <LogOut className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canManageClub && (
              <div className="space-y-2">
                <Label className="text-xs">
                  Ajouter un membre du comité (par email)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    type="email"
                    className="h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold h-9"
                    disabled={addingMember}
                    onClick={addClubMember}
                  >
                    {addingMember ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Ajouter"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {canManageClub && comiteInviteCode && (
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs">
                  Code d&apos;invitation du comité
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={comiteInviteCode}
                    readOnly
                    className="h-9 text-sm font-mono"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-3"
                    title="Copier le code"
                    onClick={copyInviteCode}
                  >
                    <Copy className={`h-4 w-4 ${comiteCodeCopied ? "text-green-500" : ""}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 px-3"
                    title="Régénérer le code"
                    disabled={regeneratingCode}
                    onClick={regenerateInviteCode}
                  >
                    <RefreshCw className={`h-4 w-4 ${regeneratingCode ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  À transmettre aux personnes qui rejoignent le comité à
                  l&apos;inscription. La régénération invalide l&apos;ancien code.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      {isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Zone dangereuse
            </CardTitle>
            <CardDescription>
              Supprimer l&apos;équipe entraîne la perte de toutes les données
              associées
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!deleting ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      "Êtes-vous sûr de vouloir supprimer cette équipe ? Cette action est irréversible."
                    )
                  ) {
                    deleteTeam();
                  }
                }}
              >
                Supprimer l&apos;équipe
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Suppression...</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quitter l'équipe (non-owner) */}
      {!isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <LogOut className="h-5 w-5" />
              Quitter l&apos;équipe
            </CardTitle>
            <CardDescription>
              Vous perdrez l&apos;accès aux données de cette équipe
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!leaving ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      "Êtes-vous sûr de vouloir quitter cette équipe ? Vous pourrez la rejoindre à nouveau avec le code d'invitation."
                    )
                  ) {
                    leaveTeam();
                  }
                }}
              >
                Quitter l&apos;équipe
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Départ...</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
