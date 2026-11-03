# 🚀 Scaleway Migration — Execution Plan

**Status:** Ready for Phase 0 (Preparation)  
**Timeline:** 8-10 weeks to production  
**Current Date:** Nov 3, 2026  
**Target:** Q1 2027 production deployment

---

## 📋 Phase 0: Preparation (Week 1-2)

### Objective
Validate Scaleway infrastructure is provisioned and functional before data migration.

### Pre-requisites
- [ ] Scaleway account created + billing configured
- [ ] Team approval on migration scope + budget
- [ ] Access to Supabase credentials (dump)
- [ ] Docker installed locally (testing)

---

### Step 1: Scaleway Account Setup (Day 1)

```bash
# 1. Create Scaleway account (if new)
# Visit: scaleway.com/signup
# - Email verification
# - ID verification
# - Add payment method (credit card)

# 2. Install Scaleway CLI
curl -sSL https://downloads.scaleway.com/scaleway-cli/latest/setup.sh | bash
scw init

# 3. Configure CLI with API credentials
# In Scaleway Console → Account Settings → API Keys
# Copy: Access Key + Secret Key
scw init --profile=default

# 4. Verify setup
scw info
scw account whoami
```

**Expected Output:**
```
Organization ID: <org-id>
Project ID: <project-id>
Region: fr-par (Paris)
```

---

### Step 2: Provision Infrastructure (Day 1-2)

#### 2.1 PostgreSQL Managed Database (Production + Dev)

```bash
# Production Database
scw database postgresql create \
  --name benchrs-db-prod \
  --node-type db-prod-m \
  --region fr-par \
  --backup-schedule="daily" \
  --disable-backup=false \
  --settings="max_connections=200,shared_buffers=256MB"

# Dev/Test Database (smaller)
scw database postgresql create \
  --name benchrs-db-dev \
  --node-type db-dev-s \
  --region fr-par \
  --disable-backup=false

# Verify
scw database postgresql list
# Copy: DB_HOST, DB_PORT, credentials

# Test connection
psql -h <DB_HOST> -U root -c "SELECT version();"
```

**Expected Credentials:**
```
Host: benchrs-db-prod.fr-par.scw.cloud
Port: 5432
User: root
Password: (auto-generated, save in 1password)
```

---

#### 2.2 Object Storage Buckets

```bash
# Create buckets for each document type
for bucket in documents gallery club_sponsors profiles; do
  scw object bucket create \
    --name benchrs-prod-$bucket \
    --region fr-par \
    --acl=private
done

# Create dev buckets
for bucket in documents gallery club_sponsors profiles; do
  scw object bucket create \
    --name benchrs-dev-$bucket \
    --region fr-par \
    --acl=private
done

# List buckets
scw object bucket list

# Get S3 endpoint URL
# Format: https://s3.fr-par.scw.cloud
```

**Credentials for S3 Access:**
```bash
# Generate in Scaleway Console → Object Storage → API Credentials
S3_ACCESS_KEY=<key>
S3_SECRET_KEY=<secret>
S3_ENDPOINT=https://s3.fr-par.scw.cloud
S3_REGION=fr-par
```

---

#### 2.3 Kubernetes Cluster (Kapsule)

```bash
# Create dev cluster first
scw k8s cluster create \
  --name benchrs-cluster-dev \
  --version 1.28 \
  --region fr-par \
  --pools name=default,min-size=1,max-size=3,node-type=DEV1-S

# Get kubeconfig
scw k8s kubeconfig get benchrs-cluster-dev > ~/.kube/config-benchrs-dev
export KUBECONFIG=~/.kube/config-benchrs-dev

# Verify
kubectl cluster-info
kubectl get nodes
kubectl get pods --all-namespaces

# Create namespace for app
kubectl create namespace benchrs-prod
kubectl create namespace benchrs-dev
```

**Cluster Info:**
```
Cluster ID: <cluster-id>
Kubeconfig: ~/.kube/config-benchrs-dev
Nodes: 1-3 (auto-scaling)
```

---

#### 2.4 Container Registry

```bash
# Create namespace in Scaleway Registry
scw registry namespace create \
  --name benchrs-registry \
  --region fr-par \
  --description "Benchrs Docker images"

# Authenticate Docker locally
scw registry login

# Test push (dummy image)
docker tag nginx:latest rg.fr-par.scw.cloud/benchrs-registry/test:latest
docker push rg.fr-par.scw.cloud/benchrs-registry/test:latest

# Verify
scw registry image list --namespace=benchrs-registry
```

---

### Step 3: Test Dump/Restore (Day 2-3)

#### 3.1 Dump from Supabase

```bash
# Get Supabase connection string from:
# Supabase Console → Project → Settings → Database → Connection String

# Full dump (with data)
pg_dump "postgresql://postgres:[password]@db.supabase.co:5432/postgres" \
  -F custom \
  -b \
  -v \
  --no-owner \
  > benchrs_dump_test.bak

# Check dump size
du -h benchrs_dump_test.bak
# Expected: 50-150 MB for full DB + data

# Verify dump integrity
pg_restore -l benchrs_dump_test.bak | head -20
```

---

#### 3.2 Restore to Scaleway (Dev)

```bash
# Create database first
psql -h benchrs-db-dev.fr-par.scw.cloud \
  -U root \
  -c "CREATE DATABASE benchrs_test;"

# Restore from backup
pg_restore -d benchrs_test \
  -h benchrs-db-dev.fr-par.scw.cloud \
  -U root \
  -v \
  --no-owner \
  benchrs_dump_test.bak

# Verify restoration
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs_test << 'SQL'
SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema='public';
SELECT version();
\d  -- List tables
SQL

# Test RLS is intact
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs_test -c "\dp"
```

**Expected Output:**
```
table_count | 30+
version     | PostgreSQL 15.x
RLS policies | (all transferred)
```

---

### Step 4: Verify Auth & RLS (Day 3)

```bash
# Check auth tables
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs_test << 'SQL'
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' AND table_name LIKE '%profile%';

SELECT * FROM profiles LIMIT 1;

-- Verify RLS policies exist
SELECT schemaname, tablename, policyname FROM pg_policies;
SQL

# Test JWT auth (if applicable)
# Contact Supabase to confirm auth schema compatibility
```

---

### Step 5: Create .env.scaleway (Day 3)

```bash
# Create secrets file (NEVER commit to git)
cat > .env.scaleway << 'SECRETS'
# Database (Scaleway PostgreSQL)
DATABASE_URL="postgresql://root:[PASSWORD]@benchrs-db-prod.fr-par.scw.cloud:5432/benchrs"
DATABASE_URL_DEV="postgresql://root:[PASSWORD]@benchrs-db-dev.fr-par.scw.cloud:5432/benchrs_test"

# Supabase (temporary - for auth compatibility)
NEXT_PUBLIC_SUPABASE_URL="https://[project-id].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[anon-key]"
SUPABASE_SERVICE_ROLE_KEY="[service-role-key]"

# Object Storage (Scaleway S3)
S3_ENDPOINT="https://s3.fr-par.scw.cloud"
S3_ACCESS_KEY="[access-key]"
S3_SECRET_KEY="[secret-key]"
S3_REGION="fr-par"
S3_BUCKET_DOCUMENTS="benchrs-prod-documents"
S3_BUCKET_GALLERY="benchrs-prod-gallery"
S3_BUCKET_SPONSORS="benchrs-prod-club_sponsors"
S3_BUCKET_PROFILES="benchrs-prod-profiles"

# Kubernetes
KUBE_CLUSTER_ID="[cluster-id]"
KUBE_NAMESPACE="benchrs-prod"

# Container Registry
REGISTRY_URL="rg.fr-par.scw.cloud"
REGISTRY_NAMESPACE="benchrs-registry"

# Application
NEXT_PUBLIC_API_URL="https://api.benchrs.app"
NODE_ENV="production"
SECRETS
```

⚠️ **IMPORTANT:** Never commit to git. Store in GitHub Secrets or 1Password.

---

### Step 6: Checklist Validation (Day 4)

```bash
# Validate all components are working
cat > /tmp/phase0_checklist.sh << 'CHECK'
#!/bin/bash

echo "🔍 Phase 0 Validation Checklist"
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
s3cmd ls s3://benchrs-prod-documents/ > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# 5. Kubernetes
echo -n "✓ Kubernetes: "
kubectl cluster-info > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# 6. Container Registry
echo -n "✓ Container Registry: "
docker pull rg.fr-par.scw.cloud/benchrs-registry/test:latest > /dev/null 2>&1 && echo "OK" || echo "FAIL"

# 7. Dump/Restore validated
echo -n "✓ Dump/Restore: "
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs_test -c "SELECT count(*) FROM profiles" > /dev/null 2>&1 && echo "OK" || echo "FAIL"

echo ""
echo "All checks complete!"
CHECK

chmod +x /tmp/phase0_checklist.sh
/tmp/phase0_checklist.sh
```

**Expected Result:**
```
✓ Scaleway CLI: OK
✓ PostgreSQL (dev): OK
✓ PostgreSQL (prod): OK
✓ Object Storage: OK
✓ Kubernetes: OK
✓ Container Registry: OK
✓ Dump/Restore: OK

All checks complete!
```

---

## 📊 Phase 0 Deliverables

By end of Week 2, you should have:

- [ ] ✅ Scaleway account + billing active
- [ ] ✅ PostgreSQL (prod + dev) provisioned & tested
- [ ] ✅ Object Storage buckets (prod + dev) ready
- [ ] ✅ Kubernetes cluster deployed & accessible
- [ ] ✅ Container Registry namespace created
- [ ] ✅ Dump/restore validated (no data loss)
- [ ] ✅ .env.scaleway file created (secure storage)
- [ ] ✅ All infrastructure green-checked

---

## 💰 Phase 0 Costs (Estimate)

```
PostgreSQL Managed (2 instances, 2 weeks)     ~€40
Object Storage (100 MB, 2 weeks)              ~€2
Kubernetes (dev, 1-3 nodes, 2 weeks)          ~€60
Total estimated Phase 0:                      ~€100
```

---

## ⏱️ Timeline

- **Day 1:** Account setup + CLI configuration
- **Day 2:** Infrastructure provisioning (DB, S3, K8s, Registry)
- **Day 2-3:** Dump/restore testing
- **Day 3:** .env.scaleway setup
- **Day 4:** Final validation & checklist

**Go/No-Go Decision:** End of Day 4

---

## 🚨 Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Database connection fails | Test psql before moving forward |
| S3 bucket permissions | Verify IAM/ACL in Scaleway Console |
| K8s cluster not ready | Wait for "Ready" status, check node logs |
| Dump corrupted | Restore on dev first, never touch prod |
| Storage quota exceeded | Monitor dashboard, increase if needed |

---

## ✅ Go/No-Go Criteria

**GO to Phase 1 if:**
- [ ] All infrastructure provisioned
- [ ] Dump/restore successful on dev DB
- [ ] RLS policies preserved
- [ ] All .env variables configured
- [ ] Validation checklist 100% green
- [ ] Budget approved by stakeholders

**NO-GO if:**
- [ ] Any infrastructure component fails
- [ ] Dump/restore shows data loss
- [ ] RLS policies missing or broken
- [ ] More than 2 items unchecked

---

**Next Phase:** Phase 1 — Database Migration (Week 3)  
**Document Updated:** Nov 3, 2026  
**Status:** Ready for execution

