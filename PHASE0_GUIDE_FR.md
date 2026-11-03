# 🚀 PHASE 0 — Guide Exécution en Français

**Status:** Prêt à démarrer | 4 jours de travail  
**Début:** Nov 4, 2026 (aujourd'hui ou demain)  
**Fin prévue:** Nov 11, 2026 (fin de semaine 2)  
**Durée totale:** 2 semaines (avec tests et validations)

---

## 📋 Ce que nous allons faire

### Phase 0 = Infrastructure Provisioning
- ✅ PostgreSQL prod + dev (Scaleway)
- ✅ Object Storage S3 (8 buckets: 4 prod, 4 dev)
- ✅ Kubernetes Kapsule cluster
- ✅ Container Registry
- ✅ Tests dump/restore depuis Supabase
- ✅ Validation complète

### Budget Phase 0
```
PostgreSQL (2 semaines)    ~€40
Object Storage            ~€2
Kubernetes (dev)          ~€60
TOTAL                     ~€100
```

### Résultat attendu
```
Fin de Phase 0:
  ✅ Infra Scaleway 100% fonctionnelle
  ✅ Dump/restore validé (0 perte de données)
  ✅ RLS policies préservées
  ✅ .env.scaleway créé (credentials)
  ✅ Go/No-Go decision prise pour Phase 1
```

---

## 🗓️ CALENDRIER DÉTAILLÉ

### JOUR 1 (Nov 4)

**Matin: Account Setup (30 min)**
```bash
# 1. Scaleway CLI installation
curl -sSL https://downloads.scaleway.com/scaleway-cli/latest/setup.sh | bash

# 2. Configuration
scw init

# Vous avez besoin de:
#   - Access Key (Scaleway Console → Account Settings → API Keys)
#   - Secret Key (même endroit)
#   - Region: fr-par (Paris)

# 3. Vérification
scw info
scw account whoami
```

**Après-midi: Lecture SCALEWAY_EXECUTION_PLAN.md (1h)**
- Comprendre les étapes 1-6
- Préparer les credentials Supabase
- Créer liste de contrôle

---

### JOUR 2 (Nov 5)

**Matin: PostgreSQL Production (1-2h)**
```bash
# Créer la database prod
scw database postgresql create \
  --name benchrs-db-prod \
  --node-type db-prod-m \
  --region fr-par \
  --backup-schedule="daily" \
  --disable-backup=false \
  --settings="max_connections=200,shared_buffers=256MB"

# Vérifier
scw database postgresql list

# 👉 SAUVEGARDER:
#   - Host: benchrs-db-prod.fr-par.scw.cloud
#   - Port: 5432
#   - User: root
#   - Password: (dans Scaleway Console)
```

**Après-midi: PostgreSQL Dev (30 min)**
```bash
# Créer la database dev
scw database postgresql create \
  --name benchrs-db-dev \
  --node-type db-dev-s \
  --region fr-par \
  --disable-backup=false

# Vérifier
scw database postgresql list

# Test de connexion (optionnel)
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -c "SELECT 1"
# Demander password quand demandé
```

**Fin d'après-midi: Object Storage (1-2h)**
```bash
# Créer buckets PROD
for bucket in documents gallery club_sponsors profiles; do
  scw object bucket create \
    --name benchrs-prod-$bucket \
    --region fr-par \
    --acl=private
done

# Créer buckets DEV
for bucket in documents gallery club_sponsors profiles; do
  scw object bucket create \
    --name benchrs-dev-$bucket \
    --region fr-par \
    --acl=private
done

# Vérifier
scw object bucket list
```

---

### JOUR 3 (Nov 6)

**Matin: Kubernetes Cluster (30 min + 15 min d'attente)**
```bash
# Créer cluster dev
scw k8s cluster create \
  --name benchrs-cluster-dev \
  --version 1.28 \
  --region fr-par \
  --pools name=default,min-size=1,max-size=3,node-type=DEV1-S

# ⏳ Attendre 10-15 min que le cluster soit prêt
# Vérifier progression:
scw k8s cluster list

# Une fois ready, télécharger kubeconfig
scw k8s kubeconfig get benchrs-cluster-dev > ~/.kube/config-benchrs-dev
export KUBECONFIG=~/.kube/config-benchrs-dev

# Vérifier
kubectl cluster-info
kubectl get nodes
```

**Midi: Container Registry (30 min)**
```bash
# Créer namespace
scw registry namespace create \
  --name benchrs-registry \
  --region fr-par \
  --description "Benchrs Docker images"

# Authentifier Docker
scw registry login

# Test push (optionnel)
docker tag nginx:latest rg.fr-par.scw.cloud/benchrs-registry/test:latest
docker push rg.fr-par.scw.cloud/benchrs-registry/test:latest
```

**Après-midi: Dump Supabase (1-2h)**
```bash
# 1. Ouvrir Supabase Console
#    → Project → Settings → Database → Connection String

# 2. Copier la connection string

# 3. Dumper la base
pg_dump "postgresql://postgres:PASSWORD@db.supabase.co:5432/postgres" \
  -F custom -b -v --no-owner > benchrs_dump.bak

# 4. Vérifier taille
du -h benchrs_dump.bak
# Attendu: 50-150 MB

# 5. Vérifier intégrité
pg_restore -l benchrs_dump.bak | head -20
```

---

### JOUR 4 (Nov 7)

**Matin: Restore Test (1-2h)**
```bash
# 1. Créer database de test
psql -h benchrs-db-dev.fr-par.scw.cloud \
  -U root \
  -c "CREATE DATABASE benchrs_test;"

# 2. Restaurer dump
pg_restore -d benchrs_test \
  -h benchrs-db-dev.fr-par.scw.cloud \
  -U root \
  -v --no-owner benchrs_dump.bak

# 3. Vérifier restauration
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs_test << 'SQL'
SELECT count(*) as table_count 
  FROM information_schema.tables 
  WHERE table_schema='public';

SELECT version();

-- Vérifier RLS policies
SELECT schemaname, tablename, policyname FROM pg_policies;
SQL

# 4. IMPORTANT: Vérifier que les RLS policies sont présentes
#    Si 0 résultat → BLOCKER! RLS policies perdues → restauration échouée
```

**Après-midi: Validation Checklist (1h)**
```bash
#!/bin/bash

echo "🔍 PHASE 0 VALIDATION CHECKLIST"
echo "================================"

# 1. Scaleway CLI
echo -n "✓ Scaleway CLI: "
scw --version && echo "OK" || echo "FAIL"

# 2. PostgreSQL (Dev)
echo -n "✓ PostgreSQL (dev): "
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -c "SELECT 1" > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# 3. PostgreSQL (Prod)
echo -n "✓ PostgreSQL (prod): "
psql -h benchrs-db-prod.fr-par.scw.cloud -U root -c "SELECT 1" > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# 4. Object Storage
echo -n "✓ Object Storage: "
scw object bucket list | grep benchrs > /dev/null && echo "OK" || echo "FAIL"

# 5. Kubernetes
echo -n "✓ Kubernetes: "
kubectl cluster-info > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# 6. Container Registry
echo -n "✓ Container Registry: "
scw registry namespace list | grep benchrs-registry > /dev/null && echo "OK" || echo "FAIL"

# 7. Dump/Restore
echo -n "✓ Dump/Restore: "
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs_test \
  -c "SELECT count(*) FROM profiles" > /dev/null 2>&1 && echo "OK" || echo "FAIL"

echo ""
echo "All checks complete!"
```

---

## 📝 SEMAINES 2-3: Tests et Validation

### SEMAINE 2 (Nov 8-14)

**Jour 1-2: Tests complets**
- Vérifier autoscaling K8s (scale to 3 nodes)
- Tester failover (arrêter 1 node)
- Vérifier backups PITR PostgreSQL

**Jour 3-4: Documentation**
- Créer `.env.scaleway` avec tous les credentials
- Documenter les IPs LoadBalancer
- Créer runbook incident

**Jour 5: Go/No-Go Decision**
- Tous les tests verts? ✅
- RLS policies intactes? ✅
- Dump/restore 0 perte de données? ✅
- Budget approuvé? ✅
- **GO to Phase 1** ✅

---

## ⚠️ TROUBLESHOOTING

### PostgreSQL connection fails
```bash
# Vérifier status
scw database postgresql list

# Si status ≠ "ready", attendre

# Vérifier port
# Scaleway PostgreSQL toujours sur port 5432 (standard)

# Vérifier credentials
# Toujours user "root" pour Scaleway
```

### Kubernetes cluster not ready
```bash
# Vérifier status
scw k8s cluster list

# Si "provisioning", attendre 10-15 min

# Vérifier nodes
kubectl get nodes
# Tous doivent être "Ready"
```

### Dump/Restore RLS policies lost
```bash
# BLOCKER! Cela signifie:
# - Les policies RLS de Supabase ne se sont pas tranférées
# - L'auth row-level va casser

# Solution:
# 1. Vérifier dump: pg_restore -l benchrs_dump.bak | grep -i policy
# 2. Si vide, dumper différemment:
#    pg_dump ... --with-owned --if-exists

# Contact tech lead immédiatement
```

---

## 📞 CONTACTS & QUESTIONS

### Si problème technique
1. Relire SCALEWAY_EXECUTION_PLAN.md section "Risk Mitigation"
2. Check Scaleway documentation (docs.scaleway.com)
3. Contact Scaleway support (via Console)

### Si dépassement timeline
- Buffer de 2-3 semaines incorporé dans le plan
- Continuer même si Phase 0 = Nov 15 (au lieu de Nov 11)
- Phase 1 peut commencer Nov 18+ sans impact

### Si budget approche limite
- Phase 0 ne doit pas dépasser €150
- Si approche, arrêter et faire Go/No-Go early
- Scaleway refacture à l'heure

---

## ✅ CHECKLIST FINALE

Avant de passer à Phase 1, vérifier:

```
✅ Scaleway infra 100% déployée
✅ PostgreSQL (prod + dev) accessible
✅ Object Storage (8 buckets) créés
✅ Kubernetes cluster ready
✅ Container Registry accessible
✅ Dump Supabase complet (50-150 MB)
✅ Restore réussi (0 perte données)
✅ RLS policies présentes + testées
✅ Auth (JWT) fonctionnel
✅ .env.scaleway créé + sécurisé
✅ Validation checklist 100% vert
✅ Budget ~€100 (moins de €150)
✅ Équipe sign-off obtenu

RÉSULTAT: GO to Phase 1 ✅
```

---

## 🎯 NEXT: Phase 1 (DB Migration)

Quand Phase 0 est vert ✅:

```bash
# 1. Lire Phase 1 guide
cat SCALEWAY_TIMELINE.md  # Section "WEEK 3: Phase 1"

# 2. Scheduler dump/restore en prod
#    Seulement 1h de downtime accepté
#    Annoncer date 1 semaine à l'avance

# 3. Exécuter:
#    - Dump complet Supabase (même commande que Dev)
#    - Créer DB prod: CREATE DATABASE benchrs;
#    - Restore dans benchrs (prod)
#    - Validation complète + RLS
#    - Cutover: .env → Scaleway DATABASE_URL

# 4. Rollback plan:
#    - Si erreur → revert .env → Supabase
#    - Garder Supabase actif 1 semaine post-cutover
```

---

**Status:** ✅ PHASE 0 READY  
**Estimé:** 4 jours d'exécution + 1-2 semaines de validation  
**Timeline:** Nov 4-17, 2026  
**Prochaine:** Phase 1 (Nov 18+)

