"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCheck, Search, X } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import type { Notification } from "@/types";

const FILTER_GROUPS: { label: string; types: string[] }[] = [
  { label: "Toutes", types: [] },
  { label: "Convocations", types: ["convocation", "rappel"] },
  { label: "Matchs", types: ["match_live", "match_report", "match_retour", "match_checklist"] },
  { label: "Entraînement", types: ["message"] },
  { label: "Administratif", types: ["relance", "echeance", "newsletter", "cagnotte"] },
  { label: "Social", types: ["felicitation", "tournament", "on_est_parti", "physical"] },
];

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  convocation: { label: "Convocation", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  rappel: { label: "Rappel", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  match_live: { label: "Live", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  match_report: { label: "Rapport", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  match_retour: { label: "Retour", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  relance: { label: "Relance", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  echeance: { label: "Échéance", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  felicitation: { label: "Félicitation", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  message: { label: "Message", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  match_checklist: { label: "Checklist", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  on_est_parti: { label: "Départ", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  physical: { label: "Physique", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  tournament: { label: "Tournoi", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  cagnotte: { label: "Cagnotte", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  newsletter: { label: "Newsletter", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
};

function getTypeBadge(type: string | null) {
  if (!type) return null;
  return TYPE_BADGE[type] ?? { label: type.charAt(0).toUpperCase() + type.slice(1), color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" };
}

function groupByDate(notifications: Notification[]) {
  const groups: { label: string; items: Notification[] }[] = [];
  let currentLabel = "";
  for (const n of notifications) {
    const d = new Date(n.created_at);
    const label = isToday(d)
      ? "Aujourd'hui"
      : isYesterday(d)
        ? "Hier"
        : format(d, "d MMMM yyyy", { locale: fr });
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, items: [] });
    }
    groups[groups.length - 1].items.push(n);
  }
  return groups;
}

const PAGE_SIZE = 30;

export default function NotificationsPage() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState(0);
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);

  const fetchNotificationsPage = useCallback(async (pageIndex: number) => {
    if (!user?.id || !currentTeam) return;
    const supabase = createClient();
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("notifications")
      .select("id, user_id, title, body, type, is_read, team_id, created_at, url")
      .eq("user_id", user.id)
      .eq("team_id", currentTeam.id)
      .order("created_at", { ascending: false })
      .range(from, to);
    const rows = (data as Notification[]) || [];
    if (pageIndex === 0) {
      setNotifications(rows);
      setHasMore(rows.length >= PAGE_SIZE);
    } else {
      setNotifications((prev) => [...prev, ...rows]);
      if (rows.length < PAGE_SIZE) setHasMore(false);
    }
    setLoading(false);
  }, [user?.id, currentTeam?.id]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    fetchNotificationsPage(nextPage);
  }, [hasMore, loading, fetchNotificationsPage]);

  const sentinelRef = useInfiniteScroll(handleLoadMore, hasMore, loading);

  useEffect(() => {
    pageRef.current = 0;
    fetchNotificationsPage(0);
  }, [fetchNotificationsPage]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const filtered = useMemo(() => {
    let result = notifications;
    const group = FILTER_GROUPS[selectedFilter];
    if (group.types.length > 0) {
      result = result.filter((n) => n.type && group.types.includes(n.type));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
      );
    }
    return result;
  }, [notifications, selectedFilter, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  async function markAsRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  async function markAllAsRead() {
    if (!user?.id || !currentTeam) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("team_id", currentTeam.id)
      .eq("is_read", false);
    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success("Toutes les notifications marquées comme lues");
    }
  }

  function handleNotificationClick(notif: Notification) {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.url) router.push(notif.url);
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="section-gap">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0
              ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
              : "Tout est lu"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-[var(--color-navy)] border-[var(--color-navy)]/20 hover:bg-[var(--color-navy)]/5"
            onClick={markAllAsRead}
          >
            <CheckCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Tout marquer lu</span>
            <span className="sm:hidden">Tout lu</span>
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {FILTER_GROUPS.map((group, i) => (
          <button
            key={group.label}
            onClick={() => setSelectedFilter(i)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedFilter === i
                ? "bg-[var(--color-navy)] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {group.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search || selectedFilter > 0
                ? "Aucune notification correspondante"
                : "Aucune notification"}
            </p>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
                    {group.label}
                  </p>
                  <div className="space-y-1.5">
                    {group.items.map((notif) => {
                      const badge = getTypeBadge(notif.type);
                      return (
                        <button
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`w-full text-left flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                            notif.url
                              ? "cursor-pointer hover:bg-muted/50"
                              : "cursor-default"
                          } ${
                            !notif.is_read
                              ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                              : "opacity-60"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm truncate">{notif.title}</p>
                              {badge && (
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.color}`}>
                                  {badge.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {notif.body}
                            </p>
                            <p className="text-[11px] text-muted-foreground/70 mt-1">
                              {new Date(notif.created_at).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          {!notif.is_read && (
                            <div className="shrink-0 mt-1">
                              <span className="block h-2 w-2 rounded-full bg-[var(--color-gold)]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Sentinel infinite scroll */}
      <div ref={sentinelRef} className="h-4" />
    </div>
  );
}
