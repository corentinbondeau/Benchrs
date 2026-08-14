"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { fetchTeamActivePlayers } from "@/lib/players";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, CalendarPlus, Check, Gauge, Save, Wind } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";
import { notifyPhysicalTest } from "@/lib/playerAlerts";

type TestType = "vma" | "vmi";

export default function PhysicalTestsPage() {
  const router = useRouter();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [testType, setTestType] = useState<TestType>("vma");
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [players, setPlayers] = useState<Profile[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTeam) return;
    fetchTeamActivePlayers(currentTeam.id).then((data) => {
      setPlayers(data);
      setLoading(false);
    });
  }, [currentTeam]);

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l&apos;équipe...</p></div>;
  }

  function valueFor(type: TestType, playerId: string): string {
    const key = `${type}:${playerId}`;
    if (values[key] !== undefined) return values[key];
    const p = players.find((x) => x.id === playerId);
    const current = p ? p[type] : null;
    return current?.toString() ?? "";
  }

  function setValueFor(type: TestType, playerId: string, value: string) {
    setValues((v) => ({ ...v, [`${type}:${playerId}`]: value }));
  }

  async function handleSave(player: Profile) {
    if (!isCoach) return;
    const raw = valueFor(testType, player.id).trim();
    const val = parseFloat(raw);
    if (!raw || isNaN(val) || val <= 0 || val > 30) {
      toast.error(`${player.first_name} : valeur invalide (1 à 30)`);
      return;
    }
    setSaving((s) => ({ ...s, [player.id]: true }));
    const supabase = createClient();
    const testedAt = testDate ? new Date(`${testDate}T12:00:00`).toISOString() : new Date().toISOString();
    const rpc = testType === "vma" ? "update_player_vma" : "update_player_vmi";
    const payload = testType === "vma"
      ? { player_id: player.id, new_vma: val, tested_at: testedAt }
      : { player_id: player.id, new_vmi: val, tested_at: testedAt };
    const { error } = await supabase.rpc(rpc, payload);
    setSaving((s) => ({ ...s, [player.id]: false }));
    if (error) {
      toast.error(`Échec pour ${player.first_name} : ${error.message}`);
      return;
    }
    toast.success(`${player.first_name} : ${testType.toUpperCase()} = ${val.toFixed(1)} enregistrée`);
    notifyPhysicalTest({
      playerId: player.id,
      playerName: `${player.first_name} ${player.last_name}`,
      testType,
      value: val,
      teamId: currentTeam!.id,
    });
  }

  const savedCount = players.filter((p) => valueFor(testType, p.id).trim() !== "").length;

  return (
    <div className="section-gap">
      <div className="flex items-center gap-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted transition-colors" onClick={() => router.push("/physical")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Tests VMA / VMI</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Saisis les résultats de la journée de test — ils alimentent l&apos;historique des joueurs.
          </p>
        </div>
      </div>

      {/* Type + Date */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Type de test</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <button
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${testType === "vma" ? "bg-pink-100 text-pink-700 border-pink-300" : "hover:border-pink-200"}`}
              onClick={() => setTestType("vma")}
            >
              <Gauge className="h-4 w-4 inline mr-1" />VMA
            </button>
            <button
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${testType === "vmi" ? "bg-cyan-100 text-cyan-700 border-cyan-300" : "hover:border-cyan-200"}`}
              onClick={() => setTestType("vmi")}
            >
              <Wind className="h-4 w-4 inline mr-1" />VMI
            </button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Date du test</CardTitle></CardHeader>
          <CardContent>
            <Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} disabled={!isCoach} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Notes (optionnel)</CardTitle></CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conditions, météo, protocole..."
              rows={2}
              disabled={!isCoach}
            />
          </CardContent>
        </Card>
      </div>

      {/* Players */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Joueurs</CardTitle>
            {!loading && (
              <span className="text-xs text-muted-foreground">
                {savedCount} / {players.length} renseigné{savedCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="h-32 animate-pulse rounded-lg bg-muted" />
          ) : players.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucun joueur actif dans l&apos;équipe</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Joueur</TableHead>
                  <TableHead className="min-w-[140px]">Valeur {testType.toUpperCase()} (km/h)</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {p.first_name} {p.last_name}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        min="1"
                        max="30"
                        value={valueFor(testType, p.id)}
                        onChange={(e) => setValueFor(testType, p.id, e.target.value)}
                        placeholder="—"
                        disabled={!isCoach}
                        className="h-9 w-28"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {isCoach && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving[p.id] || !valueFor(testType, p.id).trim()}
                          onClick={() => handleSave(p)}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {saving[p.id] ? "..." : "Enregistrer"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tout enregistrer + lien calendrier */}
      <div className="flex flex-col sm:flex-row gap-3">
        {isCoach && (
          <Button
            className="flex-1 bg-[var(--color-primary-blue)] text-white font-semibold"
            disabled={savedCount === 0 || Object.values(saving).some(Boolean)}
            onClick={async () => {
              for (const p of players) {
                if (valueFor(testType, p.id).trim()) await handleSave(p);
              }
              toast.success(`Tests ${testType.toUpperCase()} enregistrés pour ${savedCount} joueur(s)`);
            }}
          >
            <Save className="h-4 w-4 mr-1" />
            Tout enregistrer ({savedCount})
          </Button>
        )}
        <Button variant="outline" className="flex-1" onClick={() => router.push("/calendar")}>
          <CalendarPlus className="h-4 w-4 mr-1" />
          Créer un entraînement de test
        </Button>
      </div>

      {notes && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Notes du test : </span>
          {notes}
        </p>
      )}
    </div>
  );
}
