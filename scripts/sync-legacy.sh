#!/usr/bin/env bash
#
# scripts/sync-legacy.sh
#
# Quand le lancer :
#   À chaque fois que src/ est modifié (nouveau fichier, fichier supprimé,
#   contenu changé), avant de committer. Le garde-fou CI
#   (npm run check:legacy-parity) est bloquant : si src/ et legacy-app/src/
#   divergent hors allowlist, la CI casse.
#
# Pourquoi :
#   legacy-app/ est un fork downgradé (Next 14 / React 18 / Tailwind 3) de
#   l'app principale (Next 16 / React 19 / Tailwind 4), maintenu en parallèle
#   pour des raisons de compatibilité. Ce script resynchronise le code source
#   du fork sur l'app principale, tout en préservant les quelques fichiers
#   volontairement différents (voir allowlist dans
#   scripts/check-legacy-parity.mjs).
#
# Ce que fait ce script :
#   - Recopie src/ -> legacy-app/src/
#   - Préserve côté fork : middleware.ts, app/layout.tsx, app/globals.css
#   - Ne copie jamais côté fork : proxy.ts, lib/legacyUserAgent.ts,
#     lib/legacyUserAgent.test.ts (spécifiques à l'app principale)
#   - Supprime côté fork les fichiers qui n'existent plus côté principal
#     (hors allowlist), pour éviter toute dérive silencieuse.
#   - Termine par `node scripts/check-legacy-parity.mjs` pour valider le résultat.
#
# Idempotent : relancer ce script sans modification préalable de src/ ne
# produit aucun changement (git status vide).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MAIN_SRC="src"
LEGACY_SRC="legacy-app/src"

# Fichiers propres au fork, jamais écrasés par la synchronisation.
PRESERVE_PATHS=(
  "middleware.ts"
  "app/layout.tsx"
  "app/globals.css"
)

# Fichiers propres à l'app principale, jamais copiés vers le fork.
EXCLUDE_PATHS=(
  "proxy.ts"
  "lib/legacyUserAgent.ts"
  "lib/legacyUserAgent.test.ts"
)

echo "==> Sauvegarde temporaire des fichiers propres au fork..."
TMP_PRESERVE_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_PRESERVE_DIR"' EXIT

for rel in "${PRESERVE_PATHS[@]}"; do
  src_file="$LEGACY_SRC/$rel"
  if [ -f "$src_file" ]; then
    mkdir -p "$TMP_PRESERVE_DIR/$(dirname "$rel")"
    cp "$src_file" "$TMP_PRESERVE_DIR/$rel"
  fi
done

echo "==> Synchronisation $MAIN_SRC -> $LEGACY_SRC (rsync --delete, exclusions appliquées)..."
RSYNC_EXCLUDES=()
for rel in "${EXCLUDE_PATHS[@]}"; do
  RSYNC_EXCLUDES+=(--exclude="/$rel")
done

rsync -a --delete "${RSYNC_EXCLUDES[@]}" "$MAIN_SRC/" "$LEGACY_SRC/"

echo "==> Restauration des fichiers propres au fork..."
for rel in "${PRESERVE_PATHS[@]}"; do
  backup_file="$TMP_PRESERVE_DIR/$rel"
  if [ -f "$backup_file" ]; then
    mkdir -p "$LEGACY_SRC/$(dirname "$rel")"
    cp "$backup_file" "$LEGACY_SRC/$rel"
  fi
done

echo "==> Résumé :"
echo "    - src/ synchronisé vers legacy-app/src/"
echo "    - préservés : ${PRESERVE_PATHS[*]}"
echo "    - exclus : ${EXCLUDE_PATHS[*]}"

echo "==> Vérification de la parité..."
node "$REPO_ROOT/scripts/check-legacy-parity.mjs"
