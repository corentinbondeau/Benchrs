#!/bin/bash
################################################################################
# PHASE 0 — DAY 2: PostgreSQL + Object Storage
# Copy-paste each section into your terminal (or run entire script)
# Prerequisites: 
#   - export SCW_ACCESS_KEY="..."
#   - export SCW_SECRET_KEY="..."
#   - scw CLI installed
################################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 2: PostgreSQL + Object Storage                ║${NC}"
echo -e "${GREEN}║  Estimated time: 3-4 hours                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

################################################################################
# STEP 1: PostgreSQL Production Database
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 1: PostgreSQL Production${NC}"
echo "======================================"
echo "Creating PostgreSQL instance for production..."
echo "Type: db-prod-m (2 vCPU, 4GB RAM)"
echo "Region: fr-par (Paris)"
echo "Backups: Daily (enabled)"
echo "Max connections: 200"
echo ""

scw database postgresql create \
  --name benchrs-db-prod \
  --node-type db-prod-m \
  --region fr-par \
  --backup-schedule="daily" \
  --disable-backup=false \
  --settings="max_connections=200,shared_buffers=256MB" \
  --wait

echo -e "${GREEN}✓ PostgreSQL Prod created${NC}"
echo ""

# Get connection info
echo "Fetching PostgreSQL Prod credentials..."
PROD_INSTANCE=$(scw database postgresql list --filter name=benchrs-db-prod -o json | jq -r '.[0].id')

echo ""
echo -e "${YELLOW}PostgreSQL Prod Details:${NC}"
scw database postgresql get $PROD_INSTANCE -o yaml | grep -E "status|host|port|private_ip"

echo ""
echo -e "${YELLOW}Connection String (save this!):${NC}"
echo "postgresql://root:PASSWORD@benchrs-db-prod.fr-par.scw.cloud:5432/postgres"
echo ""
read -p "✓ Press Enter to continue to Dev database..." dummy

################################################################################
# STEP 2: PostgreSQL Dev Database
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 2: PostgreSQL Dev${NC}"
echo "======================================"
echo "Creating PostgreSQL instance for development..."
echo "Type: db-dev-s (1 vCPU, 1GB RAM, cheaper)"
echo "Region: fr-par"
echo ""

scw database postgresql create \
  --name benchrs-db-dev \
  --node-type db-dev-s \
  --region fr-par \
  --disable-backup=false \
  --wait

echo -e "${GREEN}✓ PostgreSQL Dev created${NC}"
echo ""

# Get connection info
DEV_INSTANCE=$(scw database postgresql list --filter name=benchrs-db-dev -o json | jq -r '.[0].id')

echo -e "${YELLOW}PostgreSQL Dev Details:${NC}"
scw database postgresql get $DEV_INSTANCE -o yaml | grep -E "status|host|port|private_ip"

echo ""
echo -e "${YELLOW}Connection String (save this!):${NC}"
echo "postgresql://root:PASSWORD@benchrs-db-dev.fr-par.scw.cloud:5432/postgres"
echo ""

################################################################################
# STEP 3: Verify both databases
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 3: Verify Both PostgreSQL Instances${NC}"
echo "======================================"
echo ""

scw database postgresql list

echo ""
echo -e "${GREEN}✓ Both databases running${NC}"
echo ""

################################################################################
# STEP 4: Object Storage - Production Buckets
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 4: Object Storage - Production Buckets${NC}"
echo "======================================"
echo "Creating 4 production S3 buckets..."
echo ""

for bucket in documents gallery club_sponsors profiles; do
    echo "Creating benchrs-prod-$bucket..."
    scw object bucket create \
        --name benchrs-prod-$bucket \
        --region fr-par \
        --acl=private
    echo -e "${GREEN}  ✓ benchrs-prod-$bucket${NC}"
done

echo ""
echo -e "${GREEN}✓ Production buckets created${NC}"
echo ""

################################################################################
# STEP 5: Object Storage - Dev Buckets
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 5: Object Storage - Dev Buckets${NC}"
echo "======================================"
echo "Creating 4 dev S3 buckets..."
echo ""

for bucket in documents gallery club_sponsors profiles; do
    echo "Creating benchrs-dev-$bucket..."
    scw object bucket create \
        --name benchrs-dev-$bucket \
        --region fr-par \
        --acl=private
    echo -e "${GREEN}  ✓ benchrs-dev-$bucket${NC}"
done

echo ""
echo -e "${GREEN}✓ Dev buckets created${NC}"
echo ""

################################################################################
# STEP 6: Verify all buckets
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 6: Verify All Buckets${NC}"
echo "======================================"
echo ""

scw object bucket list --region fr-par

echo ""
echo -e "${YELLOW}S3 Credentials (same for all buckets):${NC}"
echo "  Endpoint: s3.fr-par.scw.cloud"
echo "  Access Key: (from Scaleway Console → Credentials)"
echo "  Secret Key: (from Scaleway Console → Credentials)"
echo ""

################################################################################
# SUMMARY
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 2 COMPLETE ✓                                  ║${NC}"
echo -e "${GREEN}║  2 PostgreSQL instances + 8 S3 buckets             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "Budget used so far:"
echo "  PostgreSQL Prod:  €1.50/day"
echo "  PostgreSQL Dev:   €0.50/day"
echo "  Object Storage:   €0.10/day"
echo "  TOTAL DAY 2:      ~€2.10"
echo ""
echo "Next: DAY 3 - Kubernetes + Container Registry"
echo ""

