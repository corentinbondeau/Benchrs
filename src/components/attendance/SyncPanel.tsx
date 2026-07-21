"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Calendar,
  Upload,
  Link,
  Info,
} from "lucide-react";
import type { SporteasySyncLog } from "@/types";

export function SyncPanel() {
  const { data: session } = useSession();
  const isCoach = session?.user?.role === "coach";

  if (!isCoach) return null;

  return (
    <Tabs defaultValue="ical" className="space-y-4">
      <TabsList>
        <TabsTrigger value="ical">
          <Link className="h-4 w-4 mr-1" />
          Lien iCal SportEasy
        </TabsTrigger>
        <TabsTrigger value="csv">
          <Upload className="h-4 w-4 mr-1" />
          Import CSV
        </TabsTrigger>
        <TabsTrigger value="api">
          <RefreshCw className="h-4 w-4 mr-1" />
          API SportEasy
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ical">
        <IcalSyncPanel />
      </TabsContent>
      <TabsContent value="csv">
        <CsvImportPanel />
      </TabsContent>
      <TabsContent value="api">
        <ApiSyncPanel />
      </TabsContent>
    </Tabs>
  );
}

function IcalSyncPanel() {
  const [icalUrl, setIcalUrl] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SporteasySyncLog | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const supabase = import("@/lib/supabase/client").then(({ createClient }) => {
      const s = createClient();
      s.from("team_settings")
        .select("value")
        .eq("key", "sporteasy_ical_url")
        .single()
        .then(({ data }) => {
          if (data?.value) setIcalUrl(data.value);
        });

      s.from("sporteasy_sync_log")
        .select("*")
        .eq("sync_type", "ical")
        .order("synced_at", { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) setLastSync(data as SporteasySyncLog);
        });
    });
  }, []);

  async function saveAndSync() {
    setSyncing(true);
    setMessage(null);

    try {
      // Save URL
      const supabase = (await import("@/lib/supabase/client")).createClient();
      await supabase.from("team_settings").upsert(
        { key: "sporteasy_ical_url", value: icalUrl, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

      // Trigger sync
      const res = await fetch("/api/sporteasy/ical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icalUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Erreur lors de la synchronisation" });
      } else {
        setMessage({
          type: "success",
          text: `${data.eventsSynced} événement(s) importé(s) avec succès`,
        });
        // Refresh last sync
        const { data: newSync } = await supabase
          .from("sporteasy_sync_log")
          .select("*")
          .eq("sync_type", "ical")
          .order("synced_at", { ascending: false })
          .limit(1)
          .single();
        if (newSync) setLastSync(newSync as SporteasySyncLog);
      }
    } catch {
      setMessage({ type: "error", text: "Erreur de connexion" });
    }

    setSyncing(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--royal)]" />
          Synchronisation iCal SportEasy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm space-y-2">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-blue-700 dark:text-blue-300">
                Comment obtenir votre lien iCal ?
              </p>
              <ol className="list-decimal list-inside mt-1 text-blue-600 dark:text-blue-400 space-y-1">
                <li>Ouvrez SportEasy et allez dans l&apos;onglet <strong>Calendrier</strong></li>
                <li>Cliquez sur <strong>&quot;Synchronisation Calendrier&quot;</strong> (en haut à droite)</li>
                <li>Cliquez sur <strong>&quot;Copier le lien&quot;</strong> pour obtenir l&apos;URL iCal</li>
                <li>Collez le lien ci-dessous</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>URL du calendrier iCal SportEasy</Label>
          <Input
            placeholder="https://api.sporteasy.net/calendar/xxx/xxx/xxx.ics"
            value={icalUrl}
            onChange={(e) => setIcalUrl(e.target.value)}
          />
        </div>

        {lastSync && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {lastSync.status === "success" ? (
              <CheckCircle className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            Dernière sync :{" "}
            {new Date(lastSync.synced_at).toLocaleString("fr-FR")} —{" "}
            {lastSync.records_synced} événement(s)
          </div>
        )}

        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        <Button
          onClick={saveAndSync}
          disabled={syncing || !icalUrl}
          className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchronisation..." : "Synchroniser maintenant"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CsvImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<"events" | "attendance">("events");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    type: string;
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", importType);

    try {
      const res = await fetch("/api/sporteasy/csv", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        type: importType,
        imported: 0,
        skipped: 1,
        errors: ["Erreur lors de l'upload"],
      });
    }

    setImporting(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4 text-[var(--royal)]" />
          Import CSV
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300 mb-2">
            Format du fichier CSV attendu :
          </p>
          <div className="space-y-1 text-amber-600 dark:text-amber-400 text-xs">
            <p><strong>Événements :</strong> titre, date, heure, lieu, type, adversaire</p>
            <p><strong>Présences :</strong> joueur, événement, statut (present/absent/late)</p>
          </div>
          <p className="text-xs mt-2 text-amber-500">
            Séparateur accepté : <code>;</code> ou <code>,</code>
          </p>
        </div>

        <div className="space-y-2">
          <Label>Type d&apos;import</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={importType === "events" ? "default" : "outline"}
              onClick={() => setImportType("events")}
            >
              Événements
            </Button>
            <Button
              size="sm"
              variant={importType === "attendance" ? "default" : "outline"}
              onClick={() => setImportType("attendance")}
            >
              Présences
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Fichier CSV</Label>
          <Input
            type="file"
            accept=".csv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <Button
          onClick={handleImport}
          disabled={importing || !file}
          className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
        >
          <Upload className={`h-4 w-4 mr-2 ${importing ? "animate-spin" : ""}`} />
          {importing ? "Import en cours..." : "Importer"}
        </Button>

        {result && (
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-3">
              <Badge className="bg-green-100 text-green-700">
                {result.imported} importé(s)
              </Badge>
              {result.skipped > 0 && (
                <Badge variant="outline">{result.skipped} ignoré(s)</Badge>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs text-destructive space-y-1">
                {result.errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApiSyncPanel() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SporteasySyncLog | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const supabase = import("@/lib/supabase/client").then(({ createClient }) => {
      const s = createClient();
      s.from("sporteasy_sync_log")
        .select("*")
        .eq("sync_type", "full")
        .order("synced_at", { ascending: false })
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) setLastSync(data as SporteasySyncLog);
        });
    });
  }, []);

  async function triggerSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sporteasy/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Erreur" });
      } else {
        setMessage({
          type: "success",
          text: `${data.eventsSynced} événement(s) et ${data.attendancesSynced} présence(s) synchronisé(es)`,
        });
      }
    } catch {
      setMessage({ type: "error", text: "Erreur de connexion" });
    }
    setSyncing(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[var(--royal)]" />
          API SportEasy (Directe)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <p>
            Nécessite une <strong>clé API SportEasy</strong>. Contactez{" "}
            <a href="mailto:contact@sporteasy.net" className="underline">
              contact@sporteasy.net
            </a>{" "}
            pour en demander l&apos;accès.
          </p>
          <p className="mt-2 text-xs">
            Configurez <code>SPORTEASY_API_KEY</code> et{" "}
            <code>SPORTEASY_TEAM_ID</code> dans votre <code>.env.local</code>.
          </p>
        </div>

        {lastSync && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {lastSync.status === "success" ? (
              <CheckCircle className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}
            Dernière sync : {new Date(lastSync.synced_at).toLocaleString("fr-FR")}
          </div>
        )}

        {message && (
          <div
            className={`rounded-lg p-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        <Button
          onClick={triggerSync}
          disabled={syncing}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchronisation..." : "Synchroniser via API"}
        </Button>
      </CardContent>
    </Card>
  );
}
