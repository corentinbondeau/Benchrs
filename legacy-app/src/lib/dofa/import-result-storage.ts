/**
 * Clé `sessionStorage` partagée entre `championship/bookmarklet/receive/page.tsx`
 * (qui reçoit la réponse de `POST /api/championships/dofa/ingest`) et
 * `championship/page.tsx` (qui l'affiche, LOT 10). Pur relais d'affichage :
 * aucune logique métier, la valeur stockée est la réponse JSON du serveur
 * telle quelle, complétée du `championshipId` résolu.
 */
export const DOFA_IMPORT_RESULT_STORAGE_KEY = "benchrs:dofa-last-import-result";

export interface DofaImportResult {
  championshipId: string;
  imported: number;
  updated: number;
  skipped: number;
  source: string;
  eventSync: {
    created: number;
    updated: number;
    noop: number;
    conflict: number;
    skippedLocked: number;
    postponed: number;
    rescheduledResetAttendances: number;
    errors: number;
  };
}
