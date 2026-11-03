#!/bin/bash
################################################################################
# PHASE 0 — DAY 2: S3 Object Storage Buckets
# Budget: Only S3 buckets (€0.10 total)
# Time: 15 minutes
# Prerequisites: Scaleway CLI + credentials
################################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 2: S3 Object Storage Buckets                 ║${NC}"
echo -e "${GREEN}║  Cost: €0.10 (negligible)                         ║${NC}"
echo -e "${GREEN}║  Time: 15 minutes                                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

################################################################################
# STEP 1: Verify Credentials
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 1: Verify Scaleway Credentials${NC}"
echo "======================================"

if [ -z "$SCW_ACCESS_KEY" ] || [ -z "$SCW_SECRET_KEY" ]; then
    echo -e "${RED}❌ ERROR: Scaleway API keys not set${NC}"
    echo ""
    echo "Set them first:"
    echo "  export SCW_ACCESS_KEY=\"your-key\""
    echo "  export SCW_SECRET_KEY=\"your-secret\""
    exit 1
fi

echo -e "${GREEN}✓ Credentials found${NC}"

if ! scw info > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to Scaleway${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Connection OK${NC}"
echo ""

################################################################################
# STEP 2: Create Production Buckets
################################################################################

echo -e "${YELLOW}▶ STEP 2: Create Production S3 Buckets${NC}"
echo "======================================"
echo ""

PROD_BUCKETS=("documents" "gallery" "club_sponsors" "profiles")

for bucket in "${PROD_BUCKETS[@]}"; do
    BUCKET_NAME="benchrs-prod-$bucket"
    echo "Creating $BUCKET_NAME..."
    
    scw object bucket create \
        --name "$BUCKET_NAME" \
        --region fr-par \
        --acl=private
    
    echo -e "${GREEN}  ✓ $BUCKET_NAME${NC}"
done

echo ""

################################################################################
# STEP 3: Create Dev Buckets
################################################################################

echo -e "${YELLOW}▶ STEP 3: Create Dev S3 Buckets${NC}"
echo "======================================"
echo ""

DEV_BUCKETS=("documents" "gallery" "club_sponsors" "profiles")

for bucket in "${DEV_BUCKETS[@]}"; do
    BUCKET_NAME="benchrs-dev-$bucket"
    echo "Creating $BUCKET_NAME..."
    
    scw object bucket create \
        --name "$BUCKET_NAME" \
        --region fr-par \
        --acl=private
    
    echo -e "${GREEN}  ✓ $BUCKET_NAME${NC}"
done

echo ""

################################################################################
# STEP 4: Verify All Buckets
################################################################################

echo -e "${YELLOW}▶ STEP 4: List All Buckets${NC}"
echo "======================================"
echo ""

scw object bucket list --region fr-par

echo ""
echo -e "${YELLOW}S3 Connection Details:${NC}"
echo "  Endpoint: s3.fr-par.scw.cloud"
echo "  Region: fr-par"
echo "  ACL: private"
echo ""
echo "Get S3 credentials:"
echo "  1. https://console.scaleway.com → Credentials"
echo "  2. Copy Access Key + Secret Key"
echo "  3. Add to ~/.env.scaleway"
echo ""

################################################################################
# SUMMARY
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 2 COMPLETE ✓                                  ║${NC}"
echo -e "${GREEN}║  8 S3 buckets created (€0.10 for 2 weeks)         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "Next: DAY 3 - Database Dump from Supabase"
echo ""

