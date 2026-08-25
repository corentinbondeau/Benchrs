#!/usr/bin/env bash
#
# Transfert des variables d'environnement du projet Vercel PRINCIPAL (Benchrs)
# vers le projet Vercel du FORK (benchrs-legacy).
#
# Prérequis :
#   - Vercel CLI installée :  npm i -g vercel
#   - Authentifié :           vercel login
#
# Usage (depuis la racine du repo) :
#   bash legacy-app/scripts/copy-env-from-main.sh
#
# Le script :
#   1. lie le dossier racine au projet principal, récupère ses variables (3 envs)
#   2. lie legacy-app/ au projet du fork
#   3. re-pousse chaque variable vers le fork (production, preview, development)
#
# Idempotent : on retire la variable côté fork avant de l'ajouter (évite les
# doublons / valeurs périmées).

set -euo pipefail

# Répertoires (le script est dans legacy-app/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEGACY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$LEGACY_DIR/.." && pwd)"

# Variables à NE PAS transférer vers le fork :
# - NEXT_PUBLIC_LEGACY_URL : propre au projet principal (URL du fork)
# - variables système Vercel (injectées automatiquement)
SKIP_REGEX='^(NEXT_PUBLIC_LEGACY_URL|VERCEL_.*|VERCEL|CI|NODE_ENV|TURBO_.*)$'

ENVIRONMENTS=(production preview development)

echo "==> 1/3  Lier le dossier racine au projet Vercel PRINCIPAL"
echo "    (choisis le projet Benchrs principal quand Vercel te le demande)"
cd "$ROOT_DIR"
vercel link

echo
echo "==> 2/3  Récupérer les variables du projet principal"
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT
# On récupère l'environnement production (le plus complet en général)
vercel env pull "$TMP_ENV" --environment=production --yes
echo "    variables récupérées dans un fichier temporaire."

echo
echo "==> 3/3  Lier legacy-app/ au projet du FORK et pousser les variables"
echo "    (choisis le projet benchrs-legacy quand Vercel te le demande)"
cd "$LEGACY_DIR"
vercel link

count=0
while IFS= read -r line || [ -n "$line" ]; do
  # ignorer commentaires et lignes vides
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue
  # séparer KEY=VALUE (au premier =)
  key="${line%%=*}"
  value="${line#*=}"
  # nettoyer espaces autour de la clé
  key="$(echo "$key" | xargs)"
  # retirer d'éventuels guillemets encadrants
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"

  # filtrer les variables à ne pas transférer
  if [[ "$key" =~ $SKIP_REGEX ]]; then
    echo "    - $key : ignoré"
    continue
  fi

  for envname in "${ENVIRONMENTS[@]}"; do
    # retirer d'abord (idempotence) — on ignore l'erreur si absent
    vercel env rm "$key" "$envname" --yes >/dev/null 2>&1 || true
    # ajouter la valeur
    printf '%s' "$value" | vercel env add "$key" "$envname" >/dev/null 2>&1 \
      && echo "    + $key -> $envname" \
      || echo "    ! échec $key -> $envname"
  done
  count=$((count + 1))
done < "$TMP_ENV"

echo
echo "==> Terminé : $count variable(s) transférée(s) vers le fork."
echo "    Lance un redeploy du projet benchrs-legacy pour appliquer :"
echo "      cd legacy-app && vercel --prod"
