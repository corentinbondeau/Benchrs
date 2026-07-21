"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import type { SporteasySyncLog } from "@/types";

export function SyncStatus() {
  const { data: session } = useSession();
  const [lastSync, setLastSync] = useState<SporteasySyncLog | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function fetchLastSync() {
      const { data } = await supabase
        .from("sporteasy_sync_log")
        .select("*")
        .order("synced_at", { ascending: false })
        .limit(1)
        .single();
      setLastSync(data as SporteasySyncLog | null);
    }
    fetchLastSync();
  }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      await fetch("/api/sporteasy/sync", { method: "POST" });
      const supabase = createClient();
      const { data } = await supabase
        .from("sporteasy_sync_log")
        .select("*")
        .order("synced_at", { ascending: false })
        .limit(1)
        .single();
      setLastSync(data as SporteasySyncLog | null);
    } catch (e) {
      console.error("Sync failed:", e);
    }
    setSyncing(false);
  }

  if (session?.user?.role !== "coach") return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>SportEasy Sync</span>
          <Badge variant="outline" className="text-xs">
            {lastSync?.status === "success" ? (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-3 w-3" /> Synchronisé
              </span>
            ) : lastSync?.status === "error" ? (
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="h-3 w-3" /> Erreur
              </span>
            ) : (
              "Jamais synchronisé"
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lastSync && (
          <div className="text-xs text-muted-foreground mb-3">
            Dernière sync :{" "}
            {new Date(lastSync.synced_at).toLocaleString("fr-FR")} —{" "}
            {lastSync.records_synced} enregistrements
          </div>
        )}
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-[var(--royal)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--royal)]/90 transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "Synchronisation..." : "Synchroniser maintenant"}
        </button>
      </CardContent>
    </Card>
  );
}
