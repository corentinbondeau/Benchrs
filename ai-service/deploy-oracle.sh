#!/usr/bin/env bash
# ============================================================
# Benchrs — Déploiement du worker d'analyse vidéo sur Oracle
# Cloud Free Tier (VM.Standard.A1.Flex, ARM, Ubuntu 24.04).
#
# Usage (sur la VM, après git clone) :
#   bash deploy-oracle.sh
#
# Ce script :
#   1. installe Docker,
#   2. pré-remplit un .env à compléter (SUPABASE_URL + KEY),
#   3. tire l'image ARM64 pré-construite depuis GitHub Container
#      Registry (construite par le workflow worker-image.yml),
#   4. installe un service systemd `benchrs-worker`
#      (auto-redémarrage au boot).
# ============================================================
set -euo pipefail

IMAGE="ghcr.io/corentinbondeau/benchrs-worker:arm64"

# ─── 1) Docker ────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "→ Installation de Docker…"
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
fi
echo "✓ Docker prêt"

# ─── 2) .env ──────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "→ Création du .env (à compléter)…"
  cp .env.example .env
  echo
  echo "⚠  Renseigne SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env puis relance :"
  echo "     bash deploy-oracle.sh"
  exit 0
fi
if ! grep -q "eyJ" .env; then
  echo "⚠  SUPABASE_SERVICE_ROLE_KEY manquante dans .env — complète puis relance."
  exit 1
fi
source .env

# ─── 3) Image + service systemd ──────────────────────────────
# Tirage de l'image ARM64 pré-construite (GHCR). Le conteneur
# récupère les secrets via --env-file (jamais committés).
echo "→ Tirage image $IMAGE …"
if ! sudo docker pull "$IMAGE"; then
  echo "⚠  Pull GHCR impossible. Vérifie que le workflow worker-image.yml"
  echo "    a poussé au moins une fois l'image (Actions → Build ARM worker image)."
  exit 1
fi
sudo docker tag "$IMAGE" benchrs-worker

# Service systemd qui (re)lance le conteneur au boot.
sudo tee /etc/systemd/system/benchrs-worker.service >/dev/null <<EOF
[Unit]
Description=Benchrs video analysis worker
After=docker.service
Requires=docker.service

[Service]
Restart=always
RestartSec=15
WorkingDirectory=/root
ExecStartPre=-/usr/bin/docker rm -f benchrs-worker
ExecStart=/usr/bin/docker run --name benchrs-worker \\
  --env-file=${PWD}/.env \\
  --restart=no \\
  benchrs-worker
ExecStop=/usr/bin/docker stop benchrs-worker

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable benchrs-worker
sudo systemctl restart benchrs-worker
echo "✓ Worker démarré — logs :"
sudo journalctl -u benchrs-worker -f --no-pager -n 40