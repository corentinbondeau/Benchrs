"use client";

/**
 * Page de distribution du bookmarklet DOFA (LOT 8).
 *
 * ⚠️ CORRECTION AU PLAN (prime sur TODO_import_championnat.md) : le
 * bookmarklet n'envoie PAS de requête vers `/api/championships/dofa/ingest`
 * et n'ouvre AUCUN CORS côté Benchrs. Il ouvre un onglet
 * `/championship/bookmarklet/receive` et lui transmet le résultat par
 * `postMessage` (cf. `src/lib/dofa/bookmarklet.ts`).
 *
 * Réservée au coach (comme le reste de la gestion du championnat) :
 * - le lien-favori est généré ENTIÈREMENT côté client (aucun script hébergé
 *   externe, aucune surface XSS supplémentaire) ;
 * - le coach saisit l'URL de la page de sa poule sur le site du district
 *   (ou le triplet manuel `cpNo/phase/poule`), réutilisant `parsePouleUrl`
 *   (lot existant, non modifié) pour l'extraction du triplet.
 */

import { useMemo, useState } from "react";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parsePouleUrl } from "@/lib/dofa/poule-url";
import { buildBookmarkletSource, BookmarkletTooLargeError } from "@/lib/dofa/bookmarklet";

export default function BookmarkletPage() {
  const { userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [input, setInput] = useState("");

  const triplet = useMemo(() => parsePouleUrl(input), [input]);

  const { bookmarkletHref, tooLargeError } = useMemo(() => {
    if (!triplet) return { bookmarkletHref: null, tooLargeError: null };
    const benchrsOrigin =
      typeof window !== "undefined" ? window.location.origin : "";
    if (!benchrsOrigin) return { bookmarkletHref: null, tooLargeError: null };
    try {
      const href = buildBookmarkletSource({
        triplet: { cp_no: triplet.cpNo, phase: triplet.phase, poule: triplet.poule },
        benchrsOrigin,
      });
      return { bookmarkletHref: href, tooLargeError: null };
    } catch (err) {
      if (err instanceof BookmarkletTooLargeError) {
        return { bookmarkletHref: null, tooLargeError: err };
      }
      throw err;
    }
  }, [triplet]);

  if (!isCoach) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Cette page est réservée au coach de l&apos;équipe.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import DOFA — bookmarklet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              1. Rendez-vous sur le site de votre district (ex.{" "}
              <code>flandres.fff.fr</code>) et ouvrez la page de la poule de
              votre équipe.
            </p>
            <p>
              2. Collez ci-dessous l&apos;URL de cette page (ou saisissez
              directement le triplet <code>cpNo/phase/poule</code>).
            </p>
            <p>
              3. Un lien-favori apparaît : glissez-le dans votre barre de
              favoris.
            </p>
            <p>
              4. Retournez sur la page de la poule du district, cliquez sur ce
              favori : un nouvel onglet Benchrs s&apos;ouvre et récupère
              automatiquement les matchs de la poule.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="poule-url">URL de la poule (ou triplet manuel)</Label>
            <Input
              id="poule-url"
              placeholder="https://flandres.fff.fr/...&id=457587&phase=1&poule=4"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>

          {input.trim() && !triplet && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              URL ou triplet invalide. Vérifiez que l&apos;adresse provient
              bien d&apos;un site <code>fff.fr</code> et contient bien
              <code> id</code>, <code>phase</code> et <code>poule</code>.
            </div>
          )}

          {tooLargeError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Le favori généré est trop volumineux pour fonctionner dans un
              navigateur ({tooLargeError.length} caractères, limite{" "}
              {tooLargeError.limit}). Ceci ne devrait pas arriver en
              production ; contactez le support si le problème persiste.
            </div>
          )}

          {bookmarkletHref && (
            <div className="space-y-2 pt-2">
              <Label>Favori à glisser dans votre barre de favoris</Label>
              <div>
                <a
                  href={bookmarkletHref}
                  onClick={(e) => e.preventDefault()}
                  className="inline-flex items-center rounded-md border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                  📥 Importer les matchs DOFA
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                Ce lien ne fonctionne pas au clic ici : il doit être glissé
                dans la barre de favoris du navigateur, puis cliqué depuis la
                page de la poule sur le site du district.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
