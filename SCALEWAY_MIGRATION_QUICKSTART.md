# Scaleway Migration — Quick Start Guide

## Phase 0: Préparation (Semaine 1-2)

### 1. Créer/Activer compte Scaleway
```bash
# Si nouveau compte
# 1. Aller sur scaleway.com
# 2. Sign up avec email
# 3. Vérifier identité (pièce ID)
# 4. Ajouter méthode paiement (CB)

# Installer CLI Scaleway
curl -sSL https://downloads.scaleway.com/scaleway-cli/latest/setup.sh | bash
scw init
```

### 2. Provisionner Infrastructure de Base (dev)
```bash
# PostgreSQL Managed Database (dev)
scw database postgresql create \
  --name benchrs-db-dev \
  --node-type db-dev-s \
  --region fr-par \
  --disable-backup=false

# Object Storage (dev)
scw object bucket create \
  --name benchrs-dev-documents \
  --region fr-par

scw object bucket create \
  --name benchrs-dev-gallery \
  --region fr-par

# Kubernetes Cluster (dev/test)
scw k8s cluster create \
  --name benchrs-cluster-dev \
  --version 1.28 \
  --region fr-par \
  --pools name=default,min-size=1,max-size=3,node-type=DEV1-S

# Récupérer kubeconfig
scw k8s kubeconfig get benchrs-cluster-dev > ~/.kube/config-benchrs-dev
export KUBECONFIG=~/.kube/config-benchrs-dev
kubectl get nodes  # Tester accès
```

### 3. Configurer Container Registry
```bash
# Créer namespace registry
scw registry namespace create \
  --name benchrs-registry \
  --region fr-par

# Générer token d'accès (dans Scaleway Console)
# Ou via CLI:
scw registry login
```

### 4. Tester Dump/Restore DB (dry-run)
```bash
# Dump depuis Supabase (ne pas restore tout de suite)
pg_dump "postgresql://user:pass@db.supabase.co/postgres" \
  -F custom -b -v > benchrs_dump_test.bak

# Tester restore sur Scaleway dev DB
# (remplacer HOST, USER, PASS par les vraies valeurs)
pg_restore -d benchrs-db-dev \
  -h <scaleway-db-host> \
  -U <user> \
  -v \
  --no-owner \
  --role=<role> \
  benchrs_dump_test.bak

# Vérifier tables
psql -h <scaleway-db-host> -U <user> -d benchrs-db-dev -c "\\dt"
```

**Coûts estimés Phase 0:** €50-100

---

## Phase 1: Migration DB (Semaine 3)

### 1. Dump complet Supabase
```bash
# Dump avec toutes les données (production-ready)
pg_dump "postgresql://user:pass@db.supabase.co/postgres" \
  -F custom \
  -b \
  -v \
  --no-owner \
  > benchrs_dump_prod.bak

# Note: Cela peut prendre 10-30 minutes selon la taille
# Vérifier avec: du -h benchrs_dump_prod.bak
```

### 2. Restore sur Scaleway PostgreSQL
```bash
# Créer la DB
psql -h <scaleway-db-host> -U root -c "CREATE DATABASE benchrs;"

# Restore
pg_restore -d benchrs \
  -h <scaleway-db-host> \
  -U root \
  -v \
  --no-owner \
  benchrs_dump_prod.bak

# Vérifier intégrité
psql -h <scaleway-db-host> -U root -d benchrs << 'SQL'
SELECT count(*) FROM information_schema.tables WHERE table_schema='public';
SELECT version();
SELECT current_setting('max_connections');
SQL
```

### 3. Vérifier RLS & Auth
```bash
# Vérifier RLS policies
psql -h <scaleway-db-host> -U root -d benchrs -c "\\dp"

# Test login (optionnel si tu as les auth creds)
curl -X POST https://<scaleway-db>/auth/v1/token \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "..."}'
```

### 4. Mettre à jour .env
```bash
# Créer .env.scaleway (ou remplacer .env)
# À commiter dans secrets de CI/CD seulement, pas en git

# DATABASE_URL (production)
DATABASE_URL="postgresql://user:pass@benchrs-db-prod.fr-par.scw.cloud/benchrs"

# Garder NEXT_PUBLIC_SUPABASE_URL temporairement (auth legacy)
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

**Coûts Phase 1:** €100-200

---

## Phase 2: Migration Storage (3-4 jours)

### 1. Créer buckets Scaleway
```bash
for bucket in documents gallery club_sponsors profiles; do
  scw object bucket create \
    --name benchrs-prod-$bucket \
    --region fr-par
done
```

### 2. Migrer fichiers S3-to-S3
```bash
# Installer s3cmd ou aws-cli
pip install s3cmd
# ou
brew install awscli

# Configure Supabase S3 endpoint
# (obtenir clés dans Supabase console)

s3cmd --configure
# Enter credentials for Supabase

# Sync chaque bucket
for bucket in documents gallery club_sponsors profiles; do
  echo "Syncing $bucket..."
  s3cmd sync s3://supabase-$bucket/ s3://benchrs-prod-$bucket/
done
```

### 3. Vérifier accès
```bash
# List files
s3cmd ls s3://benchrs-prod-documents/

# Test public URL (si bucket public)
curl https://benchrs-prod-documents.s3.fr-par.scw.cloud/some-file.pdf
```

**Coûts Phase 2:** €20-50

---

## Phase 3: Déployer App sur K8s (2-3 semaines)

### 1. Builder & push image Docker
```bash
# Test build localement
docker build -t benchrs:test .
docker run -it --rm -p 3000:3000 benchrs:test

# Build et push vers Scaleway Registry
docker build -t benchrs:latest .
docker tag benchrs:latest rg.fr-par.scw.cloud/benchrs-registry/benchrs:latest
docker push rg.fr-par.scw.cloud/benchrs-registry/benchrs:latest
```

### 2. Créer secrets Kubernetes
```bash
kubectl create namespace benchrs-prod

# Créer secrets
kubectl create secret generic benchrs-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=next-public-supabase-url="https://..." \
  --from-literal=supabase-anon-key="..." \
  -n benchrs-prod

# Vérifier
kubectl get secrets -n benchrs-prod
```

### 3. Déployer via Helm
```bash
# Installer/upgrade
helm upgrade --install benchrs ./helm \
  --namespace benchrs-prod \
  -f helm/values.yaml \
  --set image.tag=latest

# Vérifier pods
kubectl get pods -n benchrs-prod
kubectl logs -n benchrs-prod -l app=benchrs -f

# Port-forward (test)
kubectl port-forward -n benchrs-prod svc/benchrs 3000:80
# Ouvrir http://localhost:3000
```

### 4. Configurer DNS & LoadBalancer
```bash
# Récupérer IP du LB
kubectl get svc -n benchrs-prod benchrs

# Dans console Scaleway:
# 1. DNS Zone → Add A record
#    - Name: benchrs.app
#    - Type: A
#    - Value: <LB-IP>

# 2. LB → Configure SSL
#    - Generate cert (Let's Encrypt)
#    - Frontend: 443 → Backend: 3000
```

### 5. Déployer CronJobs
```bash
kubectl apply -f kubernetes/cronjobs.yaml

# Vérifier
kubectl get cronjobs -n benchrs-prod
kubectl logs -n benchrs-prod -l app=benchrs
```

**Coûts Phase 3:** €300-500/mois

---

## Phase 4: AI Worker (1-2 semaines)

### 1. Builder image YOLO
```bash
# Dans ai-service/
docker build -t benchrs-ai:latest .
docker tag benchrs-ai:latest \
  rg.fr-par.scw.cloud/benchrs-registry/benchrs-ai:latest
docker push rg.fr-par.scw.cloud/benchrs-registry/benchrs-ai:latest
```

### 2. Provisionner Elastic Metal (GPU)
```bash
scw baremetal server create \
  --name benchrs-ai-worker \
  --offer GPU-3090 \
  --region fr-par \
  --os ubuntu-22.04

# Attendre ~5 min
# SSH dans le serveur
ssh root@<EM-IP>

# Installer drivers GPU
apt-get update
apt-get install -y nvidia-docker2 nvidia-cuda-toolkit
systemctl restart docker

# Test GPU
docker run --rm --gpus all nvidia/cuda:11.8.0-runtime-ubuntu22.04 \
  nvidia-smi
```

### 3. Déployer worker YOLO
```bash
# Sur Elastic Metal
docker run -d \
  --name benchrs-ai \
  --gpus all \
  -e DATABASE_URL="postgresql://..." \
  -e QUEUE_URL="redis://..." \
  rg.fr-par.scw.cloud/benchrs-registry/benchrs-ai:latest
```

**Coûts Phase 4:** €200-400/mois

---

## Phase 5-6: CI/CD Migration

### Créer .gitlab-ci.yml
```yaml
stages:
  - build
  - test
  - deploy

variables:
  REGISTRY_URL: rg.fr-par.scw.cloud
  IMAGE_NAME: benchrs-registry/benchrs

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $REGISTRY_URL/$IMAGE_NAME:$CI_COMMIT_SHA .
    - docker push $REGISTRY_URL/$IMAGE_NAME:$CI_COMMIT_SHA

test:
  stage: test
  image: node:22
  script:
    - npm ci
    - npm run lint
    - npm run typecheck

deploy_prod:
  stage: deploy
  image: alpine/helm:latest
  script:
    - helm upgrade --install benchrs ./helm
        --namespace benchrs-prod
        --set image.tag=$CI_COMMIT_SHA
  only:
    - main
```

---

## Checklist Post-Migration

- [ ] App accessible via DNS
- [ ] SSL certificat valide
- [ ] Login fonctionnelle
- [ ] API calls répondent
- [ ] Crons s'exécutent
- [ ] Storage accessible (signedURLs)
- [ ] DB queries < 100ms
- [ ] 1 semaine production OK
- [ ] Désactiver Vercel
- [ ] Arrêter services Supabase

---

## Support & Rollback

### En cas de problème
1. **Vérifier logs K8s:** `kubectl logs -n benchrs-prod <pod-name>`
2. **Rollback DB:** Restaurer snapshot Supabase
3. **DNS failover:** Pointer vers Vercel en urgence
4. **Support Scaleway:** Ouvrir ticket dans console

### Contact
- **Scaleway Support:** support.scaleway.com
- **Documentation:** scaleway.com/docs

