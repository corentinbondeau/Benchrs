#!/bin/bash
################################################################################
# PHASE 0 — DAY 3: Kubernetes + Container Registry
# Copy-paste each section into your terminal (or run entire script)
# Prerequisites: 
#   - DAY 2 complete (PostgreSQL + Storage provisioned)
#   - kubectl installed locally
#   - docker installed locally
################################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 3: Kubernetes + Container Registry            ║${NC}"
echo -e "${GREEN}║  Estimated time: 2-3 hours (mostly waiting)        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

################################################################################
# STEP 1: Kubernetes Cluster Creation
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 1: Create Kubernetes Cluster${NC}"
echo "======================================"
echo "Creating Kapsule cluster..."
echo "Version: 1.28 (stable)"
echo "Region: fr-par (Paris)"
echo "Pool: 1 DEV1-S node (expandable to 3)"
echo "⏱️  This takes 10-15 minutes"
echo ""

scw k8s cluster create \
  --name benchrs-cluster-dev \
  --version 1.28 \
  --region fr-par \
  --pools name=default,min-size=1,max-size=3,node-type=DEV1-S \
  --wait

echo -e "${GREEN}✓ Kubernetes cluster created${NC}"
echo ""

################################################################################
# STEP 2: Get Cluster Info
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 2: Cluster Details${NC}"
echo "======================================"
echo ""

scw k8s cluster list

echo ""
CLUSTER_ID=$(scw k8s cluster list --filter name=benchrs-cluster-dev -o json | jq -r '.[0].id')
echo "Cluster ID: $CLUSTER_ID"
echo ""

scw k8s cluster get $CLUSTER_ID

################################################################################
# STEP 3: Download kubeconfig
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 3: Download Kubeconfig${NC}"
echo "======================================"
echo "Setting up local kubectl access..."
echo ""

mkdir -p ~/.kube
scw k8s kubeconfig get benchrs-cluster-dev > ~/.kube/config-benchrs-dev

export KUBECONFIG=~/.kube/config-benchrs-dev

echo "Kubeconfig saved to: ~/.kube/config-benchrs-dev"
echo ""
echo "Add to your ~/.bashrc or ~/.zshrc to persist:"
echo "  export KUBECONFIG=\$HOME/.kube/config-benchrs-dev"
echo ""

################################################################################
# STEP 4: Verify Kubernetes Cluster
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 4: Verify Kubernetes Access${NC}"
echo "======================================"
echo ""

echo "Cluster info:"
kubectl cluster-info

echo ""
echo "Cluster nodes:"
kubectl get nodes

echo ""
echo "Namespaces:"
kubectl get namespaces

echo ""
echo "System pods:"
kubectl get pods -n kube-system

echo -e "${GREEN}✓ Kubernetes operational${NC}"

################################################################################
# STEP 5: Create Container Registry
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 5: Container Registry${NC}"
echo "======================================"
echo "Creating Docker registry namespace..."
echo ""

scw registry namespace create \
  --name benchrs-registry \
  --region fr-par \
  --description "Benchrs application Docker images"

echo -e "${GREEN}✓ Registry namespace created${NC}"
echo ""

echo -e "${YELLOW}Registry Details:${NC}"
scw registry namespace list

echo ""
echo "Registry URL:"
echo "  rg.fr-par.scw.cloud/benchrs-registry"
echo ""

################################################################################
# STEP 6: Docker Authentication
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 6: Docker Authentication${NC}"
echo "======================================"
echo ""
echo "Authenticating Docker with Scaleway Registry..."
echo ""

scw registry login

echo -e "${GREEN}✓ Docker authenticated${NC}"
echo ""

# Verify docker login
echo "Verifying Docker login..."
docker info | grep -A 10 "Registries"

echo ""
echo -e "${GREEN}✓ Docker ready for registry pushes${NC}"

################################################################################
# STEP 7: Prepare Supabase Dump (MANUAL)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 7: Prepare Supabase Database Dump (MANUAL)${NC}"
echo "======================================"
echo ""
echo -e "${BLUE}IMPORTANT: Run these commands in a SEPARATE terminal${NC}"
echo ""
echo "Step A: Get your Supabase connection string"
echo "  1. Open https://app.supabase.com"
echo "  2. Select your project"
echo "  3. Settings → Database"
echo "  4. Copy the connection string (looks like:)"
echo "     postgresql://postgres:PASSWORD@db.supabase.co:5432/postgres"
echo ""

read -p "Copy-paste your Supabase connection string: " SUPABASE_URL
export SUPABASE_URL

echo ""
echo "Step B: Create dump file"
echo "  Run this in your terminal:"
echo ""
echo "  pg_dump \"$SUPABASE_URL\" \\"
echo "    -F custom -b -v --no-owner \\"
echo "    > ~/benchrs_dump.bak"
echo ""
echo "  Verify dump was created:"
echo "  du -h ~/benchrs_dump.bak"
echo ""
echo "  Expected size: 50-200 MB (depending on data)"
echo ""

read -p "Press Enter when dump file is ready... " dummy

################################################################################
# STEP 8: Verify Dump File
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 8: Verify Dump File${NC}"
echo "======================================"
echo ""

if [ -f ~/benchrs_dump.bak ]; then
    echo -e "${GREEN}✓ Dump file exists${NC}"
    du -h ~/benchrs_dump.bak
else
    echo -e "${RED}❌ Dump file NOT found at ~/benchrs_dump.bak${NC}"
    echo "Make sure you ran: pg_dump ... > ~/benchrs_dump.bak"
    exit 1
fi

################################################################################
# SUMMARY
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 3 COMPLETE ✓                                  ║${NC}"
echo -e "${GREEN}║  Kubernetes cluster + Registry + DB dump ready     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "Summary:"
echo "  ✓ Kubernetes cluster running (1 node)"
echo "  ✓ kubectl configured locally"
echo "  ✓ Container Registry ready"
echo "  ✓ Supabase database dumped"
echo ""
echo "Budget used so far:"
echo "  Day 2 (PostgreSQL + Storage): €2-3"
echo "  Day 3 (Kubernetes):           €15-20"
echo "  SUBTOTAL:                     €17-23"
echo ""
echo "Next: DAY 4 - Database Restore + Validation"
echo ""

