# PHASE 0 — Scaleway Infrastructure Provisioning

> **Timeline:** Nov 4-7, 2026 (4 days execution) + Nov 8-14 (validation)  
> **Budget:** €100 (dev provisioning + testing)  
> **Status:** Ready to execute  

## Quick Start

Choose your execution method:

### Option 1: Step-by-Step (Recommended for first time)
```bash
# Day 1: Credentials (already done)
# No script needed

# Day 2: PostgreSQL + Object Storage
bash PHASE0_DAY2_COMMANDS.sh

# Day 3: Kubernetes + Registry
bash PHASE0_DAY3_COMMANDS.sh

# Day 4: Database Restore + Validation
bash PHASE0_DAY4_COMMANDS.sh
```

### Option 2: Full Script
```bash
# Run everything (no manual steps)
bash PHASE0_COPYPASTE.sh
```

### Option 3: Copy-Paste
```bash
# Copy sections from PHASE0_DAY*_COMMANDS.sh
# Paste into your terminal one-by-one
# Useful if you want to understand each step
```

---

## Prerequisites

### 1. Scaleway Account + API Keys
```bash
export SCW_ACCESS_KEY="your-access-key"
export SCW_SECRET_KEY="your-secret-key"
```

Get keys from: https://console.scaleway.com/account/credentials

### 2. Required CLI Tools
```bash
# Scaleway CLI
curl -sSL https://downloads.scaleway.com/scaleway-cli/latest/setup.sh | bash

# Kubernetes tools
sudo apt-get install kubectl postgresql-client

# Docker (already installed probably)
docker --version
```

### 3. Supabase Connection String
You'll need this on Day 4:
- https://app.supabase.com → Your Project
- Settings → Database → Connection String

---

## Day-by-Day Breakdown

### DAY 1: Setup (Already Done)
- Scaleway credentials configured
- CLI tools verified
- Account ready

**Time:** 30 min (mostly manual setup)  
**Cost:** €0

---

### DAY 2: PostgreSQL + Object Storage (2-3 hours)
Creates:
- **benchrs-db-prod** — Production PostgreSQL (db-prod-m: 2vCPU, 4GB RAM)
- **benchrs-db-dev** — Dev PostgreSQL (db-dev-s: 1vCPU, 1GB RAM)
- **8 S3 Buckets** — 4 prod + 4 dev for documents, gallery, sponsors, profiles

```bash
bash PHASE0_DAY2_COMMANDS.sh
```

**Time:** 2-3 hours (mostly waiting for provisioning)  
**Cost:** €2-3 (databases only, storage minimal)  
**Output:** PostgreSQL connection strings + S3 credentials

---

### DAY 3: Kubernetes + Container Registry (2-3 hours)
Creates:
- **benchrs-cluster-dev** — Kubernetes Kapsule (1.28, 1 DEV1-S node, autoscale to 3)
- **benchrs-registry** — Docker image registry
- Prepares Supabase database dump

```bash
bash PHASE0_DAY3_COMMANDS.sh
```

**Time:** 2-3 hours (K8s provisioning takes 10-15 min)  
**Cost:** €15-20 (Kubernetes is expensive)  
**Output:** kubeconfig file + registry credentials + DB dump

---

### DAY 4: Database Restore + Validation (2-3 hours)
Actions:
- Create test database in Scaleway PostgreSQL Dev
- Restore Supabase dump
- Verify all data, RLS policies, schemas
- Run validation checklist

```bash
bash PHASE0_DAY4_COMMANDS.sh
```

**Time:** 2-3 hours (pg_restore depends on DB size)  
**Cost:** €0-1  
**Critical Checks:**
- [ ] All tables restored
- [ ] Row counts match
- [ ] RLS policies preserved (BLOCKER if missing)
- [ ] User/auth tables intact
- [ ] Extensions present

---

## What Gets Created

### Infrastructure
```
Scaleway Account
├── PostgreSQL (Managed Database)
│   ├── benchrs-db-prod (2vCPU, 4GB RAM, daily backups) — €45/month
│   └── benchrs-db-dev (1vCPU, 1GB RAM) — €15/month
│
├── Object Storage (S3)
│   ├── benchrs-prod-* (4 buckets) — €2/month
│   └── benchrs-dev-* (4 buckets) — €2/month
│
├── Kubernetes (Kapsule)
│   └── benchrs-cluster-dev (1-3 nodes) — €60/month per node
│
└── Container Registry
    └── benchrs-registry (Docker images) — €5/month
```

### Local Files
```
~/.kube/config-benchrs-dev          ← Kubernetes credentials
~/.env.scaleway                      ← All connection strings
~/benchrs_dump.bak                   ← Supabase database dump (50-200 MB)
```

---

## Cost Breakdown

| Component | Dev Period | Monthly | Notes |
|-----------|-----------|---------|-------|
| PostgreSQL Prod | 2 weeks | €45 | 2 vCPU, 4GB RAM, backups |
| PostgreSQL Dev | 2 weeks | €15 | 1 vCPU, 1GB RAM |
| Object Storage | 2 weeks | €4 | 8 buckets (4 prod, 4 dev) |
| Kubernetes Dev | 2 weeks | €60 | 1 node (can scale to 3) |
| **Phase 0 Total** | **2 weeks** | **€124** | **Testing period** |
| **Production Monthly** | - | **€700-1200** | With 2-3 K8s nodes + backups |

---

## Validation Checklist

After running all commands, verify:

### Infrastructure
- [ ] `scw database postgresql list` shows both DB instances
- [ ] `scw object bucket list` shows 8 buckets
- [ ] `scw k8s cluster list` shows 1 cluster running
- [ ] `scw registry namespace list` shows registry
- [ ] `kubectl get nodes` shows 1-3 nodes Ready

### Database
- [ ] `psql` connection to benchrs-db-dev works
- [ ] `SELECT count(*) FROM pg_tables` > 0 (tables exist)
- [ ] `SELECT count(*) FROM pg_policies` > 0 (RLS preserved)
- [ ] Sample table row counts match expectations
- [ ] Auth/user tables present and populated

### Credentials
- [ ] `~/.kube/config-benchrs-dev` exists
- [ ] `~/.env.scaleway` created with all values
- [ ] `docker login` to registry works
- [ ] S3 credentials in `~/.env.scaleway`

### Go/No-Go Decision
✅ **GO if:**
- All infrastructure deployed successfully
- Database restored with zero data loss
- RLS policies intact
- Budget under €150

❌ **NO-GO if:**
- RLS policies missing (critical blocker)
- Any infrastructure provision failed
- Data corruption detected
- Budget overrun

---

## Troubleshooting

### Connection Refused (PostgreSQL)
```bash
# Verify firewall allows 5432
scw database postgresql get <id>  # Check status

# Wait for instance to be ready (status should be "ready")
```

### pg_restore Hangs
```bash
# Kill and retry
pkill pg_restore

# Try with --no-owner --disable-triggers
pg_restore ... --disable-triggers
```

### kubectl Not Found
```bash
# Install kubectl
sudo apt-get install kubectl

# Or via snap
sudo snap install kubectl --classic
```

### Docker Push Fails
```bash
# Re-authenticate
scw registry login

# Verify login
docker login rg.fr-par.scw.cloud
```

### RLS Policies Missing
```bash
# Critical issue - policies not in dump
# Solutions:
# 1. Re-dump from Supabase with -c flag for CREATE statements
# 2. Manually recreate policies from Supabase documentation
# 3. Skip this dump, retry with fresh export
```

---

## Next Steps (After Phase 0)

### Week 2 (Nov 8-14): Validation
- Advanced testing (autoscaling, failover)
- Security review
- Load testing
- **Go/No-Go decision** (Nov 14)

### Phase 1 (Nov 18+): Database Migration
- Schedule maintenance window (1h downtime)
- Final dump from Supabase production
- Restore to Scaleway production DB
- RLS validation
- Cutover: Update `.env` → Scaleway DATABASE_URL

### Phase 2+: Application Deployment
- Build Docker image
- Push to Scaleway Registry
- Deploy to Kubernetes
- DNS cutover

---

## Key Contacts

- **Scaleway Support:** https://www.scaleway.com/en/docs/
- **Supabase:** https://supabase.com/docs
- **Kubernetes:** https://kubernetes.io/docs/

---

## Files in This Directory

| File | Purpose |
|------|---------|
| `PHASE0_README.md` | This guide |
| `PHASE0_COPYPASTE.sh` | Full Phase 0 script (all 4 days) |
| `PHASE0_DAY2_COMMANDS.sh` | PostgreSQL + Object Storage |
| `PHASE0_DAY3_COMMANDS.sh` | Kubernetes + Registry |
| `PHASE0_DAY4_COMMANDS.sh` | Database restore + validation |
| `SCALEWAY_README.md` | Architecture overview |
| `SCALEWAY_TIMELINE.md` | Full 7-phase roadmap |
| `DOCKER_BUILD_GUIDE.md` | How to build + push Docker image |

---

**Status:** ✅ Ready to execute Nov 4, 2026

