#!/usr/bin/env bash
#
# scripts/sync-legacy.sh
#
# Quand le lancer :
#   À chaque fois que la logique métier partagée (src/lib/**, src/types/**,
#   src/components/lineup/**) est modifiée (nouveau fichier, fichier
#   supprimé, contenu changé), avant de committer. Le garde-fou CI
#   (npm run check:legacy-parity) est bloquant : si ce périmètre diverge
#   hors allowlist entre src/ et legacy-app/src/, la CI casse.
#
# Pourquoi un périmètre restreint :
#   legacy-app/ est un fork downgradé (Next 14 / React 18 / Tailwind 3) de
#   l'app principale (Next 16 / React 19 / Tailwind 4). Depuis le lot de
#   corrections UX du fork (error boundaries propres, accessibilité,
#   pagination, pause des timers), legacy-app/src/app/** et les composants
#   UI hors lineup ont volontairement divergé de src/ : ce ne sont plus des
#   miroirs, mais une variante assumée. Resynchroniser tout src/ écraserait
#   ce travail. Seule la LOGIQUE MÉTIER PARTAGÉE (lib, types, composants de
#   composition d'équipe) doit donc rester identique entre les deux
#   arborescences.
#
# Ce que fait ce script :
#   - Recopie UNIQUEMENT src/lib, src/types, src/components/lineup
#     vers les répertoires correspondants sous legacy-app/src/.
#   - Ne copie jamais côté fork : lib/legacyUserAgent.ts,
#     lib/legacyUserAgent.test.ts (spécifiques à l'app principale).
#   - Supprime côté fork, dans ce périmètre uniquement, les fichiers qui
#     n'existent plus côté principal (hors allowlist), pour éviter toute
#     dérive silencieuse.
#   - Ne touche JAMAIS à legacy-app/src/app/** ni aux composants UI du fork
#     hors lineup (error boundaries, pages, etc. restent intacts).
#   - Termine par `node scripts/check-legacy-parity.mjs` pour valider le résultat.
#
# Idempotent : relancer ce script sans modification préalable du périmètre
# ne produit aucun changement (git status vide).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MAIN_SRC="src"
LEGACY_SRC="legacy-app/src"

# Racines synchronisées : uniquement la logique métier partagée.
# Doit rester cohérent avec PARITY_SCOPE dans scripts/check-legacy-parity.mjs.
SCOPE_ROOTS=(
  "lib"
  "types"
  "components/lineup"
)

# Fichiers propres à l'app principale, jamais copiés vers le fork.
EXCLUDE_PATHS=(
  "lib/legacyUserAgent.ts"
  "lib/legacyUserAgent.test.ts"
)

echo "==> Synchronisation restreinte au périmètre logique métier : ${SCOPE_ROOTS[*]}"

for rel_root in "${SCOPE_ROOTS[@]}"; do
  main_dir="$MAIN_SRC/$rel_root"
  legacy_dir="$LEGACY_SRC/$rel_root"

  if [ ! -d "$main_dir" ]; then
    echo "    (ignoré : $main_dir n'existe pas)"
    continue
  fi

  mkdir -p "$legacy_dir"

  RSYNC_EXCLUDES=()
  for excl in "${EXCLUDE_PATHS[@]}"; do
    case "$excl" in
      "$rel_root"/*)
        RSYNC_EXCLUDES+=(--exclude="/${excl#"$rel_root"/}")
        ;;
    esac
  done

  echo "    - $main_dir -> $legacy_dir (rsync --delete${RSYNC_EXCLUDES:+, exclusions appliquées})"
  rsync -a --delete "${RSYNC_EXCLUDES[@]}" "$main_dir/" "$legacy_dir/"
done

echo "==> Résumé :"
echo "    - périmètre synchronisé : ${SCOPE_ROOTS[*]}"
echo "    - exclus : ${EXCLUDE_PATHS[*]}"
echo "    - non touché (divergence volontaire du fork) : app/**, composants UI hors lineup"

echo "==> Vérification de la parité..."
node "$REPO_ROOT/scripts/check-legacy-parity.mjs"
