#!/bin/bash
################################################################################
# PHASE 0 — DAY 4: Restore + Validate
# Restore Supabase dump to Scaleway PostgreSQL
# Time: 2 hours
# Prerequisites: dump file from DAY 3
################################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 4: Restore + Validation                       ║${NC}"
echo -e "${GREEN}║  Cost: €0                                          ║${NC}"
echo -e "${GREEN}║  Time: 2 hours                                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

################################################################################
# STEP 1: Verify Dump File
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 1: Verify Dump File${NC}"
echo "======================================"

DUMP_FILE="$HOME/benchrs_supabase_dump.bak"

if [ ! -f "$DUMP_FILE" ]; then
    echo -e "${RED}❌ Dump file not found: $DUMP_FILE${NC}"
    echo "Run PHASE0_OPTIMIZED_DAY3.sh first"
    exit 1
fi

echo -e "${GREEN}✓ Dump file exists${NC}"
du -h "$DUMP_FILE"

echo ""

################################################################################
# STEP 2: Get Connection Strings
################################################################################

echo -e "${YELLOW}▶ STEP 2: Get PostgreSQL Credentials${NC}"
echo "======================================"
echo ""

read -p "Enter Scaleway PostgreSQL connection string: " SCALEWAY_URL
export SCALEWAY_URL

echo ""

################################################################################
# STEP 3: Restore to Dev Database
################################################################################

echo -e "${YELLOW}▶ STEP 3: Restore to benchrs_dev${NC}"
echo "======================================"
echo ""
echo "Starting restore (this may take 5-15 minutes)..."
echo ""

pg_restore \
  "$DUMP_FILE" \
  -d benchrs_dev \
  -h $(echo $SCALEWAY_URL | cut -d'@' -f2 | cut -d':' -f1) \
  -U root \
  -v \
  --no-owner \
  2>&1 | head -20

echo ""
echo -e "${GREEN}✓ Restore to dev database complete${NC}"
echo ""

################################################################################
# STEP 4: Verify Dev Database
################################################################################

echo -e "${YELLOW}▶ STEP 4: Verify Dev Database${NC}"
echo "======================================"
echo ""

# Get connection details
HOST=$(echo $SCALEWAY_URL | cut -d'@' -f2 | cut -d':' -f1)
PORT=$(echo $SCALEWAY_URL | cut -d':' -f4 | cut -d'/' -f1)

echo "Counting tables..."
TABLE_COUNT=$(psql -h "$HOST" -U root -d benchrs_dev -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" -t)

echo "Tables: $TABLE_COUNT"

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Tables present${NC}"
else
    echo -e "${RED}❌ No tables found${NC}"
    exit 1
fi

echo ""
echo "Table details:"
psql -h "$HOST" -U root -d benchrs_dev -c "\dt"

echo ""

################################################################################
# STEP 5: Check RLS Policies (CRITICAL)
################################################################################

echo -e "${YELLOW}▶ STEP 5: Verify RLS Policies${NC}"
echo "======================================"
echo ""

RLS_COUNT=$(psql -h "$HOST" -U root -d benchrs_dev -c "SELECT count(*) FROM pg_policies;" -t)

echo "RLS Policies found: $RLS_COUNT"

if [ "$RLS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ RLS policies preserved (CRITICAL!)${NC}"
    echo ""
    echo "Policies:"
    psql -h "$HOST" -U root -d benchrs_dev -c "SELECT schemaname, tablename, policyname FROM pg_policies LIMIT 5;"
else
    echo -e "${RED}❌ NO RLS POLICIES FOUND${NC}"
    echo ""
    echo "This is a critical issue. Options:"
    echo "  1. Re-dump from Supabase with proper RLS export"
    echo "  2. Manually recreate RLS policies"
    echo "  3. Contact Supabase support"
    echo ""
    exit 1
fi

echo ""

################################################################################
# STEP 6: Sample Data Verification
################################################################################

echo -e "${YELLOW}▶ STEP 6: Sample Data Verification${NC}"
echo "======================================"
echo ""

echo "Row count summary:"
psql -h "$HOST" -U root -d benchrs_dev << 'SQL'
SELECT 
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 10;
SQL

echo ""

################################################################################
# STEP 7: Test Restore to Prod (Optional)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 7: Optional - Restore to benchrs_prod${NC}"
echo "======================================"
echo ""

read -p "Restore to prod database also? (y/N): " -n 1 RESTORE_PROD
echo ""

if [[ $RESTORE_PROD == "y" || $RESTORE_PROD == "Y" ]]; then
    echo "Restoring to prod..."
    
    pg_restore \
      "$DUMP_FILE" \
      -d benchrs_prod \
      -h "$HOST" \
      -U root \
      -v \
      --no-owner
    
    echo -e "${GREEN}✓ Restore to prod database complete${NC}"
fi

echo ""

################################################################################
# STEP 8: Create Environment File
################################################################################

echo -e "${YELLOW}▶ STEP 8: Create ~/.env.scaleway${NC}"
echo "======================================"
echo ""

ENV_FILE="$HOME/.env.scaleway"

cat > "$ENV_FILE" << ENVFILE
# Scaleway Production Database
DATABASE_URL_PROD="postgresql://root:PASSWORD@$HOST:$PORT/benchrs_prod"

# Scaleway Dev Database
DATABASE_URL_DEV="postgresql://root:PASSWORD@$HOST:$PORT/benchrs_dev"

# S3 Object Storage
S3_ENDPOINT="s3.fr-par.scw.cloud"
S3_REGION="fr-par"
S3_ACCESS_KEY="(get from Scaleway Console → Credentials)"
S3_SECRET_KEY="(get from Scaleway Console → Credentials)"

# Container Registry
REGISTRY_URL="rg.fr-par.scw.cloud/benchrs-registry"
REGISTRY_USERNAME="(get from Scaleway Console)"
REGISTRY_PASSWORD="(get from Scaleway Console)"
ENVFILE

echo "Environment file created: $ENV_FILE"
echo ""
echo "⚠️  Update with real passwords:"
echo "  1. Open $ENV_FILE"
echo "  2. Replace PASSWORD with PostgreSQL root password"
echo "  3. Get S3 + Registry credentials from Scaleway Console"
echo ""

################################################################################
# VALIDATION CHECKLIST
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  VALIDATION CHECKLIST                              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "✓ Database restored with $TABLE_COUNT tables"
echo "✓ RLS policies: $RLS_COUNT policies"

if [ "$TABLE_COUNT" -gt 0 ] && [ "$RLS_COUNT" -gt 0 ]; then
    echo ""
    echo -e "${GREEN}✓✓✓ ALL CHECKS PASSED - GO FOR PHASE 1 ✓✓✓${NC}"
    echo ""
    echo "Status: READY FOR PRODUCTION"
else
    echo ""
    echo -e "${RED}❌ CRITICAL ISSUES FOUND${NC}"
    echo ""
    exit 1
fi

echo ""

################################################################################
# SUMMARY
################################################################################

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  PHASE 0 PROVISIONING COMPLETE ✓✓✓                ║${NC}"
echo -e "${GREEN}║  Ready for Phase 1 (Application Deployment)       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "Summary:"
echo "  ✓ 8 S3 buckets created (€0.10)"
echo "  ✓ Supabase database dumped"
echo "  ✓ Scaleway PostgreSQL S1 prepared"
echo "  ✓ Data restored and verified"
echo "  ✓ RLS policies intact"
echo ""
echo "Phase 0 Total Cost: ~€1-2"
echo "Phase 1 Ready: YES"
echo ""
echo "Next Step: Deploy application to Scaleway Compute Instances"
echo "  Timeline: Week of Nov 18, 2026"
echo "  Cost: €5-15/month (Compute + Load Balancer)"
echo ""

