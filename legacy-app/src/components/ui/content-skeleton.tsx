/**
 * ContentSkeleton — skeleton du contenu principal
 *
 * Remplace l'écran blanc "Chargement..." pendant les états de chargement.
 * Limité au contenu principal (pas h-screen) : le shell/navbar reste visible.
 * Réutilisable pour les Suspense boundaries (P4.2).
 */

export function ContentSkeleton() {
  return (
    <div
      role="status"
      data-testid="content-skeleton"
      aria-label="Chargement du contenu"
      className="p-6 space-y-4 animate-pulse"
    >
      {/* Ligne titre */}
      <div className="h-8 bg-muted rounded w-1/3" />

      {/* Lignes de contenu */}
      <div className="space-y-2">
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-5/6" />
        <div className="h-4 bg-muted rounded w-4/6" />
      </div>

      {/* Bloc carte simulé */}
      <div className="h-32 bg-muted rounded w-full" />

      {/* Lignes secondaires */}
      <div className="space-y-2">
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-3/4" />
      </div>
    </div>
  );
}
