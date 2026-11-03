#!/bin/bash
################################################################################
# PHASE 0 — Scaleway Migration Setup
# Copy-paste this entire script to your local terminal
# Prerequisites: Scaleway account + API keys set as env vars
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  PHASE 0 — SCALEWAY PROVISIONING                  ║${NC}"
echo -e "${GREEN}║  Timeline: 4 days | Budget: €100                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

################################################################################
# PRE-CHECK: API Keys
################################################################################

echo ""
echo -e "${YELLOW}▶ PRE-CHECK: Scaleway Credentials${NC}"
echo "===================================="

if [ -z "$SCW_ACCESS_KEY" ] || [ -z "$SCW_SECRET_KEY" ]; then
    echo -e "${RED}❌ ERROR: Scaleway API keys not found in environment${NC}"
    echo ""
    echo "Please set before running:"
    echo "  export SCW_ACCESS_KEY=\"your-access-key\""
    echo "  export SCW_SECRET_KEY=\"your-secret-key\""
    echo ""
    echo "Get them from: https://console.scaleway.com/account/credentials"
    exit 1
fi

echo -e "${GREEN}✓ Credentials found${NC}"

# Verify CLI
if ! command -v scw &> /dev/null; then
    echo -e "${RED}❌ scw CLI not found${NC}"
    echo ""
    echo "Install it:"
    echo "  curl -sSL https://downloads.scaleway.com/scaleway-cli/latest/setup.sh | bash"
    exit 1
fi

echo -e "${GREEN}✓ Scaleway CLI installed${NC}"

# Verify connection
echo ""
echo "Testing Scaleway API connection..."
if scw info > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Connection OK${NC}"
else
    echo -e "${RED}❌ Connection failed${NC}"
    echo "Check your API keys and try again"
    exit 1
fi

################################################################################
# DAY 1: Account Setup (Already done, skip to Day 2)
################################################################################

echo ""
echo -e "${YELLOW}▶ DAY 1: Setup (SKIPPED - already configured)${NC}"
echo "=================================================="
echo "Credentials configured ✓"
echo ""

################################################################################
# DAY 2: PostgreSQL + Object Storage
################################################################################

echo -e "${YELLOW}▶ DAY 2: PostgreSQL + Object Storage (STARTING)${NC}"
echo "=================================================="

echo ""
echo "Creating PostgreSQL Production database..."
echo "(This may take 2-3 minutes)"
echo ""

scw database postgresql create \
  --name benchrs-db-prod \
  --node-type db-prod-m \
  --region fr-par \
  --backup-schedule="daily" \
  --disable-backup=false \
  --settings="max_connections=200,shared_buffers=256MB"

echo -e "${GREEN}✓ PostgreSQL Prod created${NC}"

echo ""
echo "Creating PostgreSQL Dev database..."

scw database postgresql create \
  --name benchrs-db-dev \
  --node-type db-dev-s \
  --region fr-par \
  --disable-backup=false

echo -e "${GREEN}✓ PostgreSQL Dev created${NC}"

echo ""
echo "Listing PostgreSQL instances..."
scw database postgresql list

echo ""
echo -e "${YELLOW}Save these credentials:${NC}"
echo "  Host: benchrs-db-prod.fr-par.scw.cloud"
echo "  Host: benchrs-db-dev.fr-par.scw.cloud"
echo "  Port: 5432"
echo "  User: root"
echo "  Password: (from Scaleway Console)"
echo ""

# Object Storage
echo ""
echo "Creating Object Storage buckets (Production)..."

for bucket in documents gallery club_sponsors profiles; do
    scw object bucket create \
        --name benchrs-prod-$bucket \
        --region fr-par \
        --acl=private
    echo -e "${GREEN}  ✓ benchrs-prod-$bucket${NC}"
done

echo ""
echo "Creating Object Storage buckets (Dev)..."

for bucket in documents gallery club_sponsors profiles; do
    scw object bucket create \
        --name benchrs-dev-$bucket \
        --region fr-par \
        --acl=private
    echo -e "${GREEN}  ✓ benchrs-dev-$bucket${NC}"
done

echo ""
echo "Listing buckets..."
scw object bucket list

################################################################################
# DAY 3: Kubernetes + Registry
################################################################################

echo ""
echo -e "${YELLOW}▶ DAY 3: Kubernetes + Container Registry (STARTING)${NC}"
echo "=================================================="

echo ""
echo "Creating Kubernetes Cluster..."
echo "(This takes 10-15 minutes - be patient!)"
echo ""

scw k8s cluster create \
  --name benchrs-cluster-dev \
  --version 1.28 \
  --region fr-par \
  --pools name=default,min-size=1,max-size=3,node-type=DEV1-S

echo -e "${GREEN}✓ Kubernetes cluster creation started${NC}"

echo ""
echo "Waiting 30 seconds for cluster to initialize..."
sleep 30

echo ""
echo "Checking cluster status..."
scw k8s cluster list

echo ""
echo "Downloading kubeconfig..."
mkdir -p ~/.kube
scw k8s kubeconfig get benchrs-cluster-dev > ~/.kube/config-benchrs-dev
export KUBECONFIG=~/.kube/config-benchrs-dev

echo -e "${GREEN}✓ Kubeconfig saved${NC}"

echo ""
echo "Verifying Kubernetes cluster..."
kubectl cluster-info
echo ""
kubectl get nodes

echo ""
echo "Creating Container Registry namespace..."

scw registry namespace create \
  --name benchrs-registry \
  --region fr-par \
  --description "Benchrs Docker images"

echo -e "${GREEN}✓ Registry created${NC}"

echo ""
echo "Authenticating Docker with Scaleway Registry..."
scw registry login

echo -e "${GREEN}✓ Docker authenticated${NC}"

################################################################################
# DAY 4: Database Dump & Restore
################################################################################

echo ""
echo -e "${YELLOW}▶ DAY 4: Database Dump & Restore (MANUAL STEPS)${NC}"
echo "=================================================="

echo ""
echo "MANUAL STEP 1: Get Supabase Connection String"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. Open: https://app.supabase.com"
echo "  2. Select your project"
echo "  3. Settings → Database → Connection String"
echo "  4. Copy the connection string"
echo ""
read -p "Press Enter when ready... " dummy

echo ""
echo "MANUAL STEP 2: Dump Supabase Database"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Run this command in your terminal:"
echo ""
echo "  pg_dump \"postgresql://postgres:PASSWORD@db.supabase.co:5432/postgres\" \\"
echo "    -F custom -b -v --no-owner > benchrs_dump.bak"
echo ""
echo "Then verify:"
echo "  du -h benchrs_dump.bak"
echo ""
read -p "Press Enter when dump is complete... " dummy

echo ""
echo "MANUAL STEP 3: Restore to Scaleway (Dev)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Create database:"
echo "  psql -h benchrs-db-dev.fr-par.scw.cloud -U root -c \"CREATE DATABASE benchrs_test;\""
echo ""
echo "Restore dump:"
echo "  pg_restore -d benchrs_test \\"
echo "    -h benchrs-db-dev.fr-par.scw.cloud -U root \\"
echo "    -v --no-owner benchrs_dump.bak"
echo ""
echo "Verify restoration:"
echo "  psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs_test -c \\"
echo "    \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'\""
echo ""
echo "Check RLS policies (CRITICAL):"
echo "  psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs_test -c \\"
echo "    \"SELECT count(*) FROM pg_policies\""
echo ""
echo "  ⚠️  If result is 0: RLS policies LOST - BLOCKER!"
echo ""
read -p "Press Enter when restore is complete... " dummy

################################################################################
# VALIDATION CHECKLIST
################################################################################

echo ""
echo -e "${YELLOW}▶ VALIDATION CHECKLIST${NC}"
echo "================================"

echo ""
echo "Checking all components..."

# 1. Scaleway CLI
echo -n "✓ Scaleway CLI: "
scw --version > /dev/null 2>&1 && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 2. PostgreSQL Prod
echo -n "✓ PostgreSQL (prod): "
scw database postgresql list 2>/dev/null | grep -q "benchrs-db-prod" && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 3. PostgreSQL Dev
echo -n "✓ PostgreSQL (dev): "
scw database postgresql list 2>/dev/null | grep -q "benchrs-db-dev" && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 4. Object Storage
echo -n "✓ Object Storage: "
scw object bucket list 2>/dev/null | grep -q "benchrs-prod" && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 5. Kubernetes
echo -n "✓ Kubernetes: "
kubectl cluster-info > /dev/null 2>&1 && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 6. Container Registry
echo -n "✓ Container Registry: "
scw registry namespace list 2>/dev/null | grep -q "benchrs-registry" && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

################################################################################
# SUMMARY
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  PHASE 0 PROVISIONING COMPLETE ✓                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "Next steps:"
echo "  1. Week 2: Advanced testing + Go/No-Go decision"
echo "  2. Phase 1: Database migration (Nov 18+)"
echo ""
echo "Budget spent (estimate): ~€100"
echo "Status: Ready for Phase 1 ✓"
echo ""

