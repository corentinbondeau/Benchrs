# Migration Infrastructure Benchrs → Scaleway

**Date d'analyse:** Nov 2026  
**Scope:** Migration complète de l'infrastructure pour optimiser coûts et souveraineté

---

## 1. ARCHITECTURE ACTUELLE

### 1.1 Frontend & API
- **Plateforme:** Vercel (Next.js 16.2.10)
- **Framework:** Next.js + React 19 + TypeScript
- **Services:** 87 routes API (Next.js Route Handlers)
- **Analytics:** Vercel Analytics + Speed Insights
- **Crons:** 2 cron jobs (notifications daily @ 14h, RGPD purge weekly @ 3h dimanche)

### 1.2 Backend & Services
| Service | Tech | Déploiement actuel | Statut |
|---------|------|-------------------|--------|
| **App principale** | Next.js SSR | Vercel | Production |
| **DB + Auth** | PostgreSQL + Supabase Auth | Supabase (multi-cloud) | Production |
| **Storage** | Supabase Storage (S3-compatible) | Supabase | Production |
| **AI Worker** | Python 3.11 + YOLO (vision) | ? (Render/Fly?) | Production |
| **DOFA Proxy** | Cloudflare Worker | Cloudflare Workers | Production |
| **Legacy App** | Next.js | Vercel | Legacy (mirror) |

### 1.3 Stockage
| Bucket | Utilisation | Taille estimée | Dépendance |
|--------|-------------|---|---|
| `documents` | PDF réunions | ~100 MB | Meetings |
| `gallery` | Photos matchs/albums | ~500 MB | Gallery / Media |
| `club_sponsors` | Logos sponsors | ~50 MB | Club page |
| `profiles` | Avatars utilisateurs | ~100 MB | User system |
| **Total** | | ~750 MB | Medium |

### 1.4 Base de Données
- **Migrations:** 134 fichiers (modèle très stable)
- **Schemas:** Complet avec RLS (Row Level Security)
- **Auth:** Supabase Auth (JWT) via PostgreSQL
- **Taille estimée:** 50-150 MB (application business)
- **Complexity:** Très structuré (teams, matches, players, coaches, profiles, etc.)

### 1.5 CI/CD
- **Plateforme:** GitHub Actions
- **Workflows:** CI sur push/PR (lint + typecheck + build)
- **Image Worker:** Workflow séparé pour ai-service Docker
- **Secrets:** GitHub Secrets (Supabase, Vercel, OLLAMA, AI_MODEL)

---

## 2. SERVICES SCALEWAY ÉQUIVALENTS

### 2.1 Remplacements directs

| Composant actuel | Scaleway équivalent | Avantages | Migration effort |
|------------------|---------------------|-----------|------------------|
| **Vercel (frontend)** | Elastic Metal / Kubernetes | Coûts prévisibles, full control | Moyen (Docker + K8s) |
| **Supabase (DB)** | PostgreSQL Managed Database | France-hosted (GDPR), compatible | Faible (dump/restore) |
| **Supabase Auth** | PostgREST + JWT (custom) | Direct sur PostgreSQL | Moyen (migration user table) |
| **Supabase Storage** | Object Storage S3 | Compatible API S3, facturé usage | Faible (S3-compatible) |
| **Cloudflare Worker** | Serverless Functions / Functions | Minimal cost | Faible (same code) |
| **GitHub Actions (CI)** | Scaleway Container Registry + GitLab CI | Multi-cloud, Scaleway-native | Moyen (.gitlab-ci.yml) |
| **AI Worker** | Bare Metal / GPU support | Plus puissant pour YOLO | Moyen (refactor deployment) |

### 2.2 Architecture cible haute-niveau

```
Internet
    ↓
┌─────────────────────────────────────┐
│  Scaleway DNS + Load Balancer       │ ← Failover / SSL
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Kubernetes Kapsule                 │ ← Next.js + API
│  (multi-node, auto-scaling)         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  PostgreSQL Managed (RDS-like)      │ ← DB + Auth (JWT)
│  (backup daily, replication)        │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Object Storage (S3-compatible)     │ ← Documents, Gallery, Sponsors
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Elastic Metal (GPU ou CPU-opt)     │ ← AI Worker (YOLO processing)
└─────────────────────────────────────┘
```

---

## 3. PLAN DE MIGRATION PAR PHASES

### PHASE 0 : Préparation (1-2 semaines)
**Objectif:** Valider l'infra Scaleway et préparer les dépôts

- [ ] Créer compte Scaleway (ou utiliser existant)
- [ ] Provisionner PostgreSQL Managed (dev + prod)
- [ ] Provisionner Object Storage buckets
- [ ] Configurer DNS (pointe vers Scaleway LB au lieu de Vercel)
- [ ] Générer secrets Scaleway (API token, DB credentials)
- [ ] Créer repository GitLab interne (ou Scaleway Container Registry)
- [ ] Audit des env vars (NEXT_PUBLIC_*, secrets)
- [ ] Test de dump/restore de la DB Supabase

**Ressources à créer:**
```bash
# PostgreSQL
scw database postgresql create \
  --name benchrs-db-prod \
  --node-type db-dev-s \
  --region fr-par

# Object Storage
scw object storage create \
  --bucket-name benchrs-prod \
  --region fr-par

# Kubernetes cluster
scw k8s cluster create \
  --name benchrs-cluster \
  --version 1.28 \
  --region fr-par \
  --pools name=default,min-size=2,max-size=5,node-type=DEV1-M
```

**Coûts estimés Phase 0:** ~€50-100 (infra test/dev)

---

### PHASE 1 : Migration de la Base de Données (1 semaine)
**Objectif:** PostgreSQL Supabase → Scaleway PostgreSQL

**Étapes:**
1. Dump complet de la DB Supabase:
   ```bash
   pg_dump "postgresql://user:pass@db.supabase.co/postgres" \
     -F custom -b > benchrs_dump.bak
   ```

2. Restore sur Scaleway PostgreSQL:
   ```bash
   pg_restore -d benchrs-db-prod \
     -h <scaleway-db-host> \
     benchrs_dump.bak
   ```

3. Valider:
   - [ ] Toutes les tables présentes
   - [ ] RLS policies conservées
   - [ ] Triggers et fonctions intacts
   - [ ] Séquences et indices OK

4. Mettre à jour `.env`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co  # Temporaire (keeper)
   DATABASE_URL=postgresql://...@scaleway-db.fr-par.scw.cloud/benchrs
   ```

**Validation post-migration:**
- [ ] Login fonctionnelle (JWT)
- [ ] Read/write sur toutes les tables principales
- [ ] RLS enforcement ✓
- [ ] Backups automatiques Scaleway ✓

**Coûts Phase 1:** ~€100-200 (DB managed, transfert data)

---

### PHASE 2 : Migration du Stockage Objet (3-4 jours)
**Objectif:** Supabase Storage → Scaleway Object Storage (S3)

**Étapes:**
1. Créer buckets dans Scaleway S3:
   ```bash
   scw object bucket create \
     --name benchrs-documents \
     --region fr-par
   scw object bucket create \
     --name benchrs-gallery \
     --region fr-par
   scw object bucket create \
     --name benchrs-sponsors \
     --region fr-par
   ```

2. Migrer les fichiers (S3 sync):
   ```bash
   # Configure Supabase S3 endpoint
   s3cmd sync \
     --access_key=$SUPABASE_S3_KEY \
     --secret_key=$SUPABASE_S3_SECRET \
     s3://supabase-documents \
     s3://scaleway-documents-prod
   ```

3. Mettre à jour le code:
   ```typescript
   // src/lib/storage.ts
   // Remplacer URL Supabase par URL Scaleway
   // S3 API reste compatible ✓
   ```

4. Update `.env`:
   ```env
   S3_ENDPOINT=https://s3.fr-par.scw.cloud
   S3_ACCESS_KEY=...
   S3_SECRET_KEY=...
   S3_REGION=fr-par
   ```

**Validation:**
- [ ] Tous les fichiers présents
- [ ] Public URLs fonctionnelles
- [ ] Signed URLs générées correctement
- [ ] Accès par clients HTTP ✓

**Coûts Phase 2:** ~€20-50 (stockage 750 MB, transfert)

---

### PHASE 3 : Migration de l'Application Next.js (2-3 semaines)
**Objectif:** Vercel → Scaleway Kubernetes

**Étapes:**

#### 3.1 Containeriser l'app Next.js
```dockerfile
# Dockerfile
FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

#### 3.2 Créer image Docker & pousser vers Scaleway Registry
```bash
docker build -t benchrs:latest .
docker tag benchrs:latest \
  rg.fr-par.scw.cloud/benchrs-registry/benchrs:latest
docker push rg.fr-par.scw.cloud/benchrs-registry/benchrs:latest
```

#### 3.3 Déployer sur Kubernetes via Helm
```yaml
# helm/values-prod.yaml
replicaCount: 3

image:
  repository: rg.fr-par.scw.cloud/benchrs-registry/benchrs
  tag: latest
  pullPolicy: Always

service:
  type: LoadBalancer
  port: 80
  targetPort: 3000

env:
  - name: NEXT_PUBLIC_SUPABASE_URL
    value: "https://..."  # Ou mettre en Scaleway DB direct
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: benchrs-secrets
        key: database-url

resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 1Gi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

```bash
helm install benchrs ./helm \
  -n benchrs-prod \
  -f helm/values-prod.yaml
```

#### 3.4 Configurer DNS & LoadBalancer
```bash
# Créer LB Scaleway
scw lb create --name benchrs-lb --region fr-par

# Configurer backend pools
scw lb backend-create \
  --name benchrs-backend \
  --lb-id <lb-id> \
  --protocol http \
  --port 3000

# Pointer DNS vers LB public IP
# benchrs.app → <LB-IP>
```

#### 3.5 Configurer les Crons (Vercel → Scaleway)
**Options:**
- [ ] CronJob Kubernetes natif
- [ ] APScheduler Python daemon
- [ ] ncrontab service déployer à part

```yaml
# kubernetes/cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: benchrs-notifications-cron
  namespace: benchrs-prod
spec:
  schedule: "0 14 * * *"  # 14h UTC chaque jour
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: curl
            image: curlimages/curl
            command:
            - /bin/sh
            - -c
            - curl -X POST http://benchrs-api:3000/api/notifications/cron
          restartPolicy: OnFailure
```

#### 3.6 Secrets Management
```bash
# Créer secret Kubernetes
kubectl create secret generic benchrs-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=supabase-anon-key="..." \
  --from-literal=service-role-key="..." \
  -n benchrs-prod
```

**Validation post-migration:**
- [ ] App accessible via LB public IP
- [ ] DNS résout + SSL certificat ✓
- [ ] Login fonctionnelle
- [ ] API calls fonctionnelles (87 routes)
- [ ] Crons s'exécutent aux heures prévues
- [ ] Analytics continuent de fonctionner (remplacer Vercel par custom?)
- [ ] Database connections stables

**Coûts Phase 3:** ~€300-500/mois (K8s nodes, LB, bandwidth)

---

### PHASE 4 : Migration du Worker AI (YOLO) (1-2 semaines)
**Objectif:** Déployer l'AI Worker Python sur Scaleway Elastic Metal

**Architecture:**
```
Benchrs API
    ↓ (POST /api/video/analyze)
Message Queue (Redis/Bull.js sur K8s)
    ↓ (consumer)
Elastic Metal (GPU-enabled)
    ↓ (Python worker + YOLO)
Result stored in DB / S3
    ↓
Webhook callback → API notification
```

**Étapes:**

#### 4.1 Provisionner Elastic Metal GPU (ou CPU-opt)
```bash
scw baremetal server create \
  --name benchrs-ai-worker \
  --offer GPU-3090 \
  --region fr-par \
  --os ubuntu-22.04
```

#### 4.2 Déployer container YOLO
```bash
# SSH into EM, install Docker + GPU drivers
ssh root@<EM-IP>
apt-get install -y nvidia-docker2
systemctl restart docker

# Pousser image Docker
docker pull rg.fr-par.scw.cloud/benchrs-registry/benchrs-ai:latest
docker run -d --gpus all \
  -e QUEUE_URL="redis://k8s-redis:6379" \
  -e DB_URL="postgresql://..." \
  rg.fr-par.scw.cloud/benchrs-registry/benchrs-ai:latest
```

#### 4.3 Intégrer queue de jobs
```typescript
// src/lib/queue.ts
import Queue from "bull";

const videoQueue = new Queue("video-analysis", {
  redis: {
    host: "redis.benchrs-prod.svc.cluster.local",
    port: 6379,
  },
});

export async function enqueueVideoAnalysis(videoPath: string) {
  await videoQueue.add({ videoPath }, { attempts: 3 });
}

// Worker consomme depuis Elastic Metal
```

**Validation:**
- [ ] Job queue reçoit messages
- [ ] EM worker consomme et traite
- [ ] Résultats stockés en DB
- [ ] Callback API notification ✓

**Coûts Phase 4:** ~€200-400/mois (GPU Elastic Metal)

---

### PHASE 5 : Migration du DOFA Proxy (3-4 jours)
**Objectif:** Cloudflare Worker → Scaleway Serverless / K8s

**Options:**

**Option A : Scaleway Serverless Functions (recommandé)**
```bash
scw function create \
  --name benchrs-dofa-proxy \
  --runtime node22 \
  --handler handler \
  --region fr-par
```

**Option B : Redéployer sur K8s (plus simple)**
```dockerfile
# Dockerfile pour proxy
FROM node:22-alpine
COPY dofa-worker/ .
RUN npm install
CMD ["npx", "wrangler", "dev", "--local"]
```

```yaml
# K8s deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dofa-proxy
  namespace: benchrs-prod
spec:
  replicas: 2
  selector:
    matchLabels:
      app: dofa-proxy
  template:
    metadata:
      labels:
        app: dofa-proxy
    spec:
      containers:
      - name: proxy
        image: rg.fr-par.scw.cloud/benchrs-registry/dofa-proxy:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
```

**Validation:**
- [ ] CORS headers OK
- [ ] DOFA API calls réussissent
- [ ] Caching fonctionne (60s)
- [ ] Rate limiting en place

**Coûts Phase 5:** ~€10-20/mois (serverless) ou inclus dans K8s

---

### PHASE 6 : CI/CD Migration (1-2 semaines)
**Objectif:** GitHub Actions → Scaleway Container Registry + GitLab CI

**Étapes:**

#### 6.1 Configurer Scaleway Container Registry
```bash
scw registry namespace create \
  --name benchrs \
  --region fr-par
```

#### 6.2 Créer `.gitlab-ci.yml`
```yaml
# .gitlab-ci.yml
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
    - docker tag $REGISTRY_URL/$IMAGE_NAME:$CI_COMMIT_SHA $REGISTRY_URL/$IMAGE_NAME:latest
    - docker push $REGISTRY_URL/$IMAGE_NAME:latest

test:
  stage: test
  image: node:22
  script:
    - npm ci
    - npm run lint
    - npm run typecheck
    - npm run test
  coverage: '/Coverage: \d+\.\d+%/'

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

#### 6.3 Configurer secrets GitLab
```bash
# Dans GitLab CI/CD settings
SCW_API_TOKEN = ...
SCW_SECRET_KEY = ...
DATABASE_URL = postgresql://...
```

**Validation:**
- [ ] Push to main déclenche pipeline
- [ ] Build réussit et push image
- [ ] Tests passent
- [ ] Deploy sur Kubernetes automatique

**Coûts Phase 6:** €0 (GitLab free tier) ou ~€50-100/mois (self-hosted)

---

### PHASE 7 : Décommissionner Vercel & Supabase (3-4 jours)
**Objectif:** Arrêter services cloud existants, valider production 1-2 semaines

**Étapes:**
1. Valider production sur Scaleway 1-2 semaines
2. Garder failover sur Vercel via DNS weight
3. Archiver repos GitHub (ou garder mirror)
4. Désactiver Vercel deployments
5. Arrêter services Supabase
6. Exporter bills historiques
7. Supprimer comptes cloud inutilisés

**Coûts Phase 7:** Économies: -€200-400/mois (Vercel + Supabase)

---

## 4. RÉSUMÉ COÛTS & CHRONOLOGIE

### Timeline (séquentiel)
```
Phase 0: Préparation              [1-2 semaines]  → Coûts: €50-100
Phase 1: DB Migration              [1 semaine]    → Coûts: €100-200
Phase 2: Storage Migration         [3-4 jours]    → Coûts: €20-50
Phase 3: App Migration (K8s)       [2-3 semaines] → Coûts: €300-500/mois
Phase 4: AI Worker                 [1-2 semaines] → Coûts: €200-400/mois
Phase 5: DOFA Proxy                [3-4 jours]    → Coûts: €10-20/mois
Phase 6: CI/CD                     [1-2 semaines] → Coûts: €0 (GitLab free)
Phase 7: Décommissionner           [3-4 jours]    → Économies: -€200-400/mois

TOTAL MIGRATION: 8-10 semaines
```

### Coûts mensuels

| Composant | Supabase (actuel) | Scaleway (cible) | Économies |
|-----------|-------------------|-----------------|-----------|
| **DB (PostgreSQL)** | €100-200 | €50-100 | -50% |
| **Storage (S3)** | €30-50 | €15-30 | -50% |
| **Frontend (Vercel)** | €50-200 | €300-500 (K8s) | +50% (mais full control) |
| **AI Worker** | ~€100 (Render?) | €200-400 (Elastic Metal) | +100% |
| **DNS/LB** | Inclus | €20-50 | Neutral |
| **CI/CD** | Free (GitHub) | Free (GitLab) | Neutral |
| **Bandwidth** | Inclus | €100-200 | Variable |
| **TOTAL** | **€280-650/mois** | **€685-1080/mois** | **+2-3x (mais full control)** |

> ⚠️ **Note:** La migration augmente coûts court-terme (Elastic Metal GPU, K8s). Optimisations possibles:
> - Scaling dynamique K8s (réduit nodes off-peak)
> - Batch processing vidéos (idle time EM)
> - Cache aggressif CDN (réduit bandwidth)
> - Reserved instances Scaleway (-30%)

---

## 5. RISQUES & MITIGATIONS

| Risque | Sévérité | Mitigation |
|--------|----------|-----------|
| **Data loss pendant dump/restore** | CRITIQUE | Snapshots Supabase avant, PITR test d'abord |
| **Downtime app migration** | HAUTE | Blue/green deployment, LB failover DNS |
| **Crons manqués** | MOYENNE | Kubeflow/APScheduler + monitoring alertes |
| **Performance DB différente** | MOYENNE | Load testing post-restore, indexes à rebuilder |
| **S3 API incompatibilité** | BASSE | S3 standard très compatible, test des uploads d'abord |
| **GPU driver issues Elastic Metal** | BASSE | EM support disponible, boot test d'abord |
| **CI/CD pipeline failure** | MOYENNE | Keep GH Actions temporaire comme fallback |

---

## 6. PROCHAINES ACTIONS

### Immédiat (cette semaine)
- [ ] Valider budget Scaleway avec le team
- [ ] Créer compte Scaleway (ou activer)
- [ ] Audit permissions IAM (service accounts)
- [ ] Tester dump/restore DB en environnement test

### Court-terme (semaine prochaine)
- [ ] Phase 0 — Provisionner infra Scaleway
- [ ] Écrire Dockerfiles pour app + workers
- [ ] Créer helm charts
- [ ] Configurer GitLab CI/CD

### Moyen-terme (2-3 semaines)
- [ ] Phase 1-2 — Migrer DB + Storage
- [ ] Tester accès depuis K8s
- [ ] Phase 3 — Déployer app sur K8s

### Long-terme (4-8 semaines)
- [ ] Phase 4-5 — Workers + Proxy
- [ ] Phase 6 — CI/CD full automation
- [ ] Phase 7 — Décommissionner Vercel/Supabase

---

## 7. SUCCESS CRITERIA

✅ **Production prête Scaleway quand:**
1. App accessible, SSL ✓
2. DB queries < 100ms p95 ✓
3. Login/auth fonctionnelle ✓
4. Crons s'exécutent ✓
5. AI Worker traite vidéos ✓
6. Storage accessible (signedURLs) ✓
7. Monitoring + alertes en place ✓
8. 1 semaine production OK ✓

