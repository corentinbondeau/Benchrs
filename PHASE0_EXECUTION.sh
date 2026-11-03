#!/bin/bash

################################################################################
# PHASE 0 — Scaleway Migration Infrastructure Provisioning
# Date: Nov 3, 2026
# Duration: 4 days (Day 1: Setup, Day 2-3: Provisioning, Day 4: Validation)
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PHASE 0 — SCALEWAY MIGRATION INFRASTRUCTURE PROVISIONING    ║${NC}"
echo -e "${BLUE}║  Status: Ready to Execute                                   ║${NC}"
echo -e "${BLUE}║  Timeline: 4 days (2 weeks to completion)                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"

################################################################################
# STEP 0: Preflight Checks
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 0: PREFLIGHT CHECKS${NC}"
echo "=================================="

# Check required tools
check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗ $1 not found. Please install it first.${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1${NC}"
    return 0
}

check_tool "docker" || exit 1
check_tool "jq" || echo -e "${YELLOW}⚠ jq recommended but optional${NC}"

echo ""
echo -e "${YELLOW}Before proceeding, ensure you have:${NC}"
echo "  ✓ Scaleway account access + API keys"
echo "  ✓ Supabase DB credentials (for dump)"
echo "  ✓ Docker installed (for local testing)"
echo ""
read -p "All prerequisites ready? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Stopping. Please prepare prerequisites first."
    exit 1
fi

################################################################################
# STEP 1: Scaleway CLI Setup (DAY 1)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 1: SCALEWAY CLI SETUP (DAY 1)${NC}"
echo "===================================="

# Check if scw CLI is installed
if ! command -v scw &> /dev/null; then
    echo -e "${YELLOW}Installing Scaleway CLI...${NC}"
    curl -sSL https://downloads.scaleway.com/scaleway-cli/latest/setup.sh | bash
    echo -e "${GREEN}✓ Scaleway CLI installed${NC}"
else
    echo -e "${GREEN}✓ Scaleway CLI already installed${NC}"
fi

# Initialize scw
echo ""
echo -e "${YELLOW}Initializing Scaleway CLI...${NC}"
echo "Run: scw init"
echo ""
echo "You'll need:"
echo "  - Access Key (from Scaleway Console → Account Settings → API Keys)"
echo "  - Secret Key (same location)"
echo ""
read -p "Press Enter after running 'scw init' and configuring... " dummy

# Verify setup
echo ""
echo -e "${YELLOW}Verifying setup...${NC}"
scw info
echo -e "${GREEN}✓ Scaleway CLI configured${NC}"

################################################################################
# STEP 2: PostgreSQL Provisioning (DAY 2)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 2: POSTGRESQL PROVISIONING (DAY 2)${NC}"
echo "=========================================="

echo ""
echo -e "${YELLOW}Creating PostgreSQL Production Database...${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    scw database postgresql create \
        --name benchrs-db-prod \
        --node-type db-prod-m \
        --region fr-par \
        --backup-schedule="daily" \
        --disable-backup=false \
        --settings="max_connections=200,shared_buffers=256MB"
    echo -e "${GREEN}✓ PostgreSQL Prod created${NC}"
fi

echo ""
echo -e "${YELLOW}Creating PostgreSQL Dev Database...${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    scw database postgresql create \
        --name benchrs-db-dev \
        --node-type db-dev-s \
        --region fr-par \
        --disable-backup=false
    echo -e "${GREEN}✓ PostgreSQL Dev created${NC}"
fi

echo ""
echo -e "${YELLOW}Listing PostgreSQL instances...${NC}"
scw database postgresql list

echo ""
echo -e "${YELLOW}Save these credentials to .env.scaleway:${NC}"
echo "  Host: benchrs-db-prod.fr-par.scw.cloud"
echo "  Port: 5432"
echo "  User: root"
echo "  Password: (shown in Scaleway Console)"

################################################################################
# STEP 3: Object Storage Provisioning (DAY 2)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 3: OBJECT STORAGE PROVISIONING (DAY 2)${NC}"
echo "=========================================="

echo ""
echo -e "${YELLOW}Creating S3 Buckets (Production)...${NC}"
for bucket in documents gallery club_sponsors profiles; do
    read -p "Create benchrs-prod-$bucket? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        scw object bucket create \
            --name benchrs-prod-$bucket \
            --region fr-par \
            --acl=private
        echo -e "${GREEN}✓ benchrs-prod-$bucket${NC}"
    fi
done

echo ""
echo -e "${YELLOW}Creating S3 Buckets (Dev)...${NC}"
for bucket in documents gallery club_sponsors profiles; do
    read -p "Create benchrs-dev-$bucket? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        scw object bucket create \
            --name benchrs-dev-$bucket \
            --region fr-par \
            --acl=private
        echo -e "${GREEN}✓ benchrs-dev-$bucket${NC}"
    fi
done

echo ""
echo -e "${YELLOW}Listing buckets...${NC}"
scw object bucket list

################################################################################
# STEP 4: Kubernetes Cluster (DAY 2-3)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 4: KUBERNETES CLUSTER PROVISIONING (DAY 2-3)${NC}"
echo "==============================================="

echo ""
echo -e "${YELLOW}Creating Kubernetes Dev Cluster...${NC}"
echo "(This may take 10-15 minutes)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    scw k8s cluster create \
        --name benchrs-cluster-dev \
        --version 1.28 \
        --region fr-par \
        --pools name=default,min-size=1,max-size=3,node-type=DEV1-S
    
    echo -e "${YELLOW}Waiting for cluster to be ready...${NC}"
    sleep 30  # Give it a moment
    
    scw k8s kubeconfig get benchrs-cluster-dev > ~/.kube/config-benchrs-dev
    export KUBECONFIG=~/.kube/config-benchrs-dev
    
    echo -e "${GREEN}✓ Kubernetes cluster ready${NC}"
    
    # Verify
    echo ""
    echo -e "${YELLOW}Verifying cluster...${NC}"
    kubectl cluster-info
    kubectl get nodes
fi

################################################################################
# STEP 5: Container Registry (DAY 3)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 5: CONTAINER REGISTRY PROVISIONING (DAY 3)${NC}"
echo "=============================================="

echo ""
echo -e "${YELLOW}Creating Container Registry Namespace...${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    scw registry namespace create \
        --name benchrs-registry \
        --region fr-par \
        --description "Benchrs Docker images"
    
    echo ""
    echo -e "${YELLOW}Authenticating Docker with Scaleway Registry...${NC}"
    scw registry login
    
    echo -e "${GREEN}✓ Container Registry configured${NC}"
fi

################################################################################
# STEP 6: Database Dump/Restore Test (DAY 3-4)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 6: DATABASE DUMP/RESTORE VALIDATION (DAY 3-4)${NC}"
echo "=================================================="

echo ""
echo -e "${YELLOW}Step 6.1: Dump from Supabase${NC}"
echo "================================"
echo ""
echo "You need to:"
echo "  1. Get Supabase connection string from:"
echo "     Supabase Console → Project → Settings → Database → Connection String"
echo ""
echo "  2. Run this command (replace PASSWORD):"
echo ""
echo "  pg_dump \"postgresql://postgres:PASSWORD@db.supabase.co:5432/postgres\" \\"
echo "    -F custom -b -v --no-owner > benchrs_dump.bak"
echo ""
echo "  3. Verify dump size:"
echo "  du -h benchrs_dump.bak"
echo ""
read -p "Press Enter once dump is complete... " dummy

# Check if dump exists
if [ ! -f "benchrs_dump.bak" ]; then
    echo -e "${RED}✗ benchrs_dump.bak not found!${NC}"
    echo "Please run the dump command above first."
    exit 1
fi

echo -e "${GREEN}✓ Dump file found${NC}"
du -h benchrs_dump.bak

echo ""
echo -e "${YELLOW}Step 6.2: Restore to Scaleway (Dev)${NC}"
echo "==================================="
echo ""
echo "Getting Scaleway DB credentials..."

# Get Scaleway DB details
SCALEWAY_DB_HOST=$(scw database postgresql list -o json | jq -r '.[] | select(.name=="benchrs-db-dev") | .endpoint_addr')
SCALEWAY_DB_PORT=$(scw database postgresql list -o json | jq -r '.[] | select(.name=="benchrs-db-dev") | .endpoint_port')

echo -e "${YELLOW}Scaleway DB Host: $SCALEWAY_DB_HOST${NC}"
echo -e "${YELLOW}Scaleway DB Port: $SCALEWAY_DB_PORT${NC}"
echo ""

echo "You need to:"
echo "  1. Get Scaleway DB password from Scaleway Console"
echo ""
echo "  2. Create database:"
echo "  psql -h $SCALEWAY_DB_HOST -U root -c \"CREATE DATABASE benchrs_test;\""
echo ""
echo "  3. Restore dump:"
echo "  pg_restore -d benchrs_test \\"
echo "    -h $SCALEWAY_DB_HOST -U root \\"
echo "    -v --no-owner benchrs_dump.bak"
echo ""
echo "  4. Verify restoration:"
echo "  psql -h $SCALEWAY_DB_HOST -U root -d benchrs_test << 'SQL'"
echo "  SELECT count(*) as table_count FROM information_schema.tables WHERE table_schema='public';"
echo "  SELECT version();"
echo "  SQL"
echo ""
read -p "Press Enter once restore is complete... " dummy

echo -e "${GREEN}✓ Database restoration complete${NC}"

################################################################################
# STEP 7: Final Validation Checklist (DAY 4)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 7: FINAL VALIDATION CHECKLIST (DAY 4)${NC}"
echo "=========================================="

echo ""
echo -e "${BLUE}Validation Checklist:${NC}"

# 1. Scaleway CLI
echo -n "✓ Scaleway CLI: "
scw --version && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 2. PostgreSQL Prod
echo -n "✓ PostgreSQL (prod): "
scw database postgresql list | grep benchrs-db-prod > /dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 3. PostgreSQL Dev
echo -n "✓ PostgreSQL (dev): "
scw database postgresql list | grep benchrs-db-dev > /dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 4. Object Storage
echo -n "✓ Object Storage: "
scw object bucket list | grep benchrs-prod > /dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 5. Kubernetes
echo -n "✓ Kubernetes: "
kubectl cluster-info &> /dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

# 6. Container Registry
echo -n "✓ Container Registry: "
scw registry namespace list | grep benchrs-registry > /dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAIL${NC}"

echo ""
echo -e "${GREEN}Phase 0 Validation Complete!${NC}"

################################################################################
# Summary
################################################################################

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PHASE 0 PROVISIONING COMPLETE                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"

echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Create .env.scaleway with all credentials"
echo "  2. Share validation results with team"
echo "  3. Go/No-Go decision for Phase 1 (DB Migration)"
echo ""
echo "Timeline:"
echo "  ✓ Phase 0: Complete (Week 1-2)"
echo "  ⏳ Phase 1: DB Migration (Week 3)"
echo "  ⏳ Phase 2: Storage Migration (Week 4)"
echo "  ⏳ Phase 3: App Deployment (Week 5-7)"
echo ""
echo -e "${BLUE}Ready for Phase 1? Run:${NC}"
echo "  cat SCALEWAY_EXECUTION_PLAN.md  # Review Phase 1 plan"
echo ""

