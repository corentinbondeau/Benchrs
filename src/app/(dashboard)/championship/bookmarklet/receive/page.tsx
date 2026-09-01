"use client";

/**
 * Page de réception du bookmarklet DOFA (LOT 8).
 *
 * Ouverte par le bookmarklet (`src/lib/dofa/bookmarklet.ts`) via
 * `window.open`, cette page reçoit par `postMessage` le résultat de
 * l'import (matchs allégés, ou `{ s: "error" }`) et le relaie vers
 * `POST /api/championships/dofa/ingest`.
 *
 * 🔒 POIGNÉE DE MAIN (anti course onglet/réseau, cf. `bookmarklet.ts`) :
 * sans elle, le bookmarklet pourrait envoyer son résultat avant que CETTE
 * page ait fini de monter et d'installer son écouteur `message` — message
 * perdu en silence. Dès que l'écouteur est en place, on signale
 * `{ t: "bdr" }` à `window.opener`, ciblé sur l'origine EXACTE du site
 * district ayant ouvert cet onglet (déduite de `document.referrer`,
 * validée par `isFffOrigin` — jamais `"*"`, jamais une origine devinée).
 * Si `document.referrer` est absent ou n'est pas une origine `fff.fr`
 * valide, aucun signal n'est envoyé : le bookmarklet, resté sans réponse,
 * abandonnera explicitement après son propre délai (15s, `alert()`).
 *
 * 🔒 SÉCURITÉ — non négociable :
 *   - le listener `message` vérifie STRICTEMENT `event.origin` via
 *     `isFffOrigin` (même garantie que `parsePouleUrl` : comparaison de
 *     hostname réelle via `new URL(...)`, jamais une recherche de
 *     sous-chaîne) — n'importe quel site ne peut PAS injecter de données
 *     dans le championnat du coach ;
 *   - la FORME du message est vérifiée avant tout traitement (`t` attendu,
 *     `p.s` dans un ensemble fermé de valeurs, `p.m` obligatoirement un
 *     tableau si `s === "ok"`) ;
 *   - un message qui ne satisfait pas ces deux contrôles est silencieusement
 *     ignoré (ni traité, ni affiché comme une erreur d'import — ce n'est
 *     simplement pas un message qui nous concerne).
 */

import { useEffect, useState } from "react";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isFffOrigin } from "@/lib/dofa/poule-url";
import { Loader2 } from "lucide-react";

type SlimMatch = {
  competition: { cp_no: number };
  phase: { number: number };
  poule: { stage_number: number };
};

type BookmarkletMessage =
  | { t: "bdi"; p: { s: "error" } }
  | { t: "bdi"; p: { s: "ok"; m: unknown[] } };

/** Vérifie la FORME du message avant tout traitement (aucune confiance a priori). */
function isBookmarkletMessage(data: unknown): data is BookmarkletMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (d.t !== "bdi") return false;
  const payload = d.p as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") return false;
  if (payload.s === "error") return true;
  if (payload.s === "ok") return Array.isArray(payload.m);
  return false;
}

/**
 * Déduit l'origine du site district ayant ouvert cet onglet à partir de
 * `document.referrer` (seule source disponible pour une fenêtre ouverte par
 * `window.open` depuis une origine tierce — `window.opener.location` est
 * inaccessible en cross-origin). Ne renvoie une origine que si elle est
 * `https://…fff.fr` réelle (`isFffOrigin`) ; sinon `null`, pour ne jamais
 * cibler un `postMessage` sur une origine devinée ou hostile.
 */
function fffOpenerOrigin(): string | null {
  if (typeof document === "undefined" || !document.referrer) return null;
  let origin: string;
  try {
    origin = new URL(document.referrer).origin;
  } catch {
    return null;
  }
  return isFffOrigin(origin) ? origin : null;
}

function isSlimMatch(m: unknown): m is SlimMatch {
  if (!m || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  const competition = r.competition as Record<string, unknown> | undefined;
  const phase = r.phase as Record<string, unknown> | undefined;
  const poule = r.poule as Record<string, unknown> | undefined;
  return (
    typeof competition?.cp_no === "number" &&
    typeof phase?.number === "number" &&
    typeof poule?.stage_number === "number"
  );
}

type Status = "waiting" | "importing" | "success" | "error";

export default function BookmarkletReceivePage() {
  const { currentTeam } = useTeam();
  const [status, setStatus] = useState<Status>("waiting");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTeam) return;

    async function handleImport(matches: unknown[]) {
      setStatus("importing");

      if (matches.length === 0) {
        setStatus("success");
        setMessage("Aucun match à importer (poule vide sur cette page).");
        return;
      }

      const first = matches[0];
      if (!isSlimMatch(first)) {
        setStatus("error");
        setMessage("Format de match inattendu, import annulé.");
        return;
      }

      try {
        const listRes = await authFetch(
          `/api/championships?team_id=${encodeURIComponent(currentTeam!.id)}`
        );
        const championships = (await listRes.json()) as Array<{
          id: string;
          dofa_cp_no: number | null;
          dofa_phase: number | null;
          dofa_poule: number | null;
        }>;

        const championship = Array.isArray(championships)
          ? championships.find(
              (c) =>
                c.dofa_cp_no === first.competition.cp_no &&
                c.dofa_phase === first.phase.number &&
                c.dofa_poule === first.poule.stage_number
            )
          : undefined;

        if (!championship) {
          setStatus("error");
          setMessage(
            "Aucun championnat configuré pour cette poule sur cette équipe. Configurez d'abord le triplet DOFA depuis la page Championnat."
          );
          return;
        }

        const ingestRes = await authFetch("/api/championships/dofa/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: currentTeam!.id,
            cpNo: first.competition.cp_no,
            phase: first.phase.number,
            poule: first.poule.stage_number,
            matches,
          }),
        });

        if (!ingestRes.ok) {
          setStatus("error");
          setMessage("L'import a été refusé par le serveur. Aucune donnée n'a été modifiée.");
          return;
        }

        setStatus("success");
        setMessage(`${matches.length} match(s) importé(s) avec succès.`);
      } catch {
        setStatus("error");
        setMessage("Erreur réseau pendant l'import. Aucune donnée n'a été modifiée.");
      }
    }

    function onMessage(event: MessageEvent) {
      // 🔒 Vérification stricte de l'origine : seul un site fff.fr peut
      // déclencher un import, jamais une recherche de sous-chaîne.
      if (!isFffOrigin(event.origin)) return;
      // 🔒 Vérification de la forme du message avant tout traitement.
      if (!isBookmarkletMessage(event.data)) return;

      if (event.data.p.s === "error") {
        setStatus("error");
        setMessage(
          "Le site du district n'a pas répondu (blocage réseau intermittent). Aucune donnée n'a été modifiée : réessayez dans quelques instants."
        );
        return;
      }

      void handleImport(event.data.p.m);
    }

    window.addEventListener("message", onMessage);

    // 🔒 Poignée de main : signale au bookmarklet que l'écouteur est
    // désormais en place, UNIQUEMENT vers l'origine fff.fr réelle ayant
    // ouvert cet onglet (jamais "*"). Si cette origine ne peut pas être
    // déterminée (referrer absent/invalide), aucun signal n'est envoyé ; le
    // bookmarklet abandonnera explicitement après son propre délai.
    const openerOrigin = fffOpenerOrigin();
    if (openerOrigin && window.opener) {
      window.opener.postMessage({ t: "bdr" }, openerOrigin);
    }

    return () => window.removeEventListener("message", onMessage);
  }, [currentTeam]);

  return (
    <div className="p-6 max-w-xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Import DOFA en cours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(status === "waiting" || status === "importing") && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status === "waiting"
                ? "En attente des données depuis le site du district…"
                : "Import en cours…"}
            </div>
          )}
          {status === "success" && (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700">
              {message}
            </div>
          )}
          {status === "error" && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
