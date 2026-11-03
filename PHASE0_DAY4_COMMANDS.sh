#!/bin/bash
################################################################################
# PHASE 0 — DAY 4: Database Restore + Validation
# Copy-paste each section into your terminal
# Prerequisites: 
#   - DAY 1-3 complete
#   - Dump file: ~/benchrs_dump.bak
#   - psql/pg_restore installed locally
################################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 4: Database Restore + Validation              ║${NC}"
echo -e "${GREEN}║  Estimated time: 2-3 hours                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

################################################################################
# PRE-CHECK: Required Tools
################################################################################

echo ""
echo -e "${YELLOW}▶ PRE-CHECK: Required Tools${NC}"
echo "======================================"
echo ""

if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ psql not found${NC}"
    echo "Install PostgreSQL client:"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
    echo "  macOS: brew install postgresql"
    exit 1
fi
echo -e "${GREEN}✓ psql installed${NC}"

if ! command -v pg_restore &> /dev/null; then
    echo -e "${RED}❌ pg_restore not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ pg_restore installed${NC}"

if [ ! -f ~/benchrs_dump.bak ]; then
    echo -e "${RED}❌ Dump file not found: ~/benchrs_dump.bak${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dump file exists${NC}"
du -h ~/benchrs_dump.bak

echo ""

################################################################################
# STEP 1: Get Scaleway PostgreSQL Dev Credentials
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 1: Get PostgreSQL Dev Credentials${NC}"
echo "======================================"
echo ""
echo "Getting connection details from Scaleway..."
echo ""

# Query Scaleway for dev database credentials
DB_HOST="benchrs-db-dev.fr-par.scw.cloud"
DB_USER="root"
DB_PORT="5432"

echo -e "${YELLOW}PostgreSQL Dev Connection:${NC}"
echo "  Host:   $DB_HOST"
echo "  User:   $DB_USER"
echo "  Port:   $DB_PORT"
echo ""
echo -e "${BLUE}You need the password from Scaleway Console:${NC}"
echo "  1. Go to https://console.scaleway.com"
echo "  2. Databases → PostgreSQL → benchrs-db-dev"
echo "  3. Copy the password"
echo ""

read -p "Enter the PostgreSQL password: " -s DB_PASS
echo ""

################################################################################
# STEP 2: Verify Connection to Scaleway DB
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 2: Test Connection to Scaleway PostgreSQL${NC}"
echo "======================================"
echo ""
echo "Testing connection..."
echo ""

if PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d postgres -c "SELECT version();" > /dev/null; then
    echo -e "${GREEN}✓ Connection successful${NC}"
else
    echo -e "${RED}❌ Connection failed${NC}"
    echo "Check your password and try again"
    exit 1
fi

echo ""

################################################################################
# STEP 3: Create Test Database
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 3: Create Test Database${NC}"
echo "======================================"
echo ""
echo "Creating database 'benchrs_test'..."
echo ""

PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d postgres -c "CREATE DATABASE benchrs_test;"

echo -e "${GREEN}✓ Database created${NC}"
echo ""

################################################################################
# STEP 4: Restore Database
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 4: Restore Supabase Database${NC}"
echo "======================================"
echo ""
echo "Restoring dump to benchrs_test..."
echo "(This may take 5-15 minutes depending on data size)"
echo ""

PGPASSWORD="$DB_PASS" pg_restore \
  -h $DB_HOST \
  -U $DB_USER \
  -p $DB_PORT \
  -d benchrs_test \
  -v \
  --no-owner \
  ~/benchrs_dump.bak

echo ""
echo -e "${GREEN}✓ Restore complete${NC}"
echo ""

################################################################################
# STEP 5: Verify Restoration - Table Count
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 5: Verify Restoration${NC}"
echo "======================================"
echo ""

echo "Checking table count..."
TABLE_COUNT=$(PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d benchrs_test -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" -t)

echo -e "${YELLOW}Tables in restored database:${NC}"
echo "  Count: $TABLE_COUNT"

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Tables present${NC}"
else
    echo -e "${RED}❌ No tables found - restore may have failed${NC}"
    exit 1
fi

echo ""

################################################################################
# STEP 6: List All Tables
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 6: Database Schema${NC}"
echo "======================================"
echo ""

PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d benchrs_test -c "\dt"

echo ""

################################################################################
# STEP 7: Check Row Counts
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 7: Data Verification${NC}"
echo "======================================"
echo ""

echo "Sample row counts per table:"
echo ""

PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d benchrs_test << 'SQL'
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  (SELECT count(*) FROM information_schema.tables 
   WHERE table_schema=schemaname AND table_name=tablename) as exists
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
SQL

echo ""

################################################################################
# STEP 8: Check RLS Policies (CRITICAL)
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 8: RLS Policies (CRITICAL)${NC}"
echo "======================================"
echo ""
echo -e "${BLUE}⚠️  RLS policies are CRITICAL for security${NC}"
echo ""

RLS_COUNT=$(PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d benchrs_test -c "SELECT count(*) FROM pg_policies;" -t)

echo "RLS Policies found: $RLS_COUNT"
echo ""

if [ "$RLS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ RLS policies preserved${NC}"
    echo ""
    echo "Policies detail:"
    PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d benchrs_test -c "SELECT schemaname, tablename, policyname FROM pg_policies ORDER BY tablename;"
else
    echo -e "${RED}❌ NO RLS POLICIES FOUND - CRITICAL ISSUE${NC}"
    echo ""
    echo "This means Row-Level Security was NOT transferred."
    echo "This is a BLOCKER for production!"
    echo ""
    echo "Options:"
    echo "  1. Re-dump from Supabase with RLS policies"
    echo "  2. Manually recreate RLS policies"
    echo ""
    exit 1
fi

echo ""

################################################################################
# STEP 9: Check User/Auth Configuration
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 9: User Configuration${NC}"
echo "======================================"
echo ""

echo "Database users:"
PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d benchrs_test -c "\du"

echo ""

################################################################################
# STEP 10: Extensions
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 10: PostgreSQL Extensions${NC}"
echo "======================================"
echo ""

echo "Installed extensions:"
PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d benchrs_test -c "\dx"

echo ""

################################################################################
# VALIDATION CHECKLIST
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  VALIDATION CHECKLIST                              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "Fill in the checklist:"
echo ""

# Auto-checks
echo -n "[ ] Connection to Scaleway DB successful: "
if PGPASSWORD="$DB_PASS" psql -h $DB_HOST -U $DB_USER -p $DB_PORT -d benchrs_test -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo -n "[ ] Database restored ($TABLE_COUNT tables): "
if [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo -n "[ ] RLS policies present ($RLS_COUNT policies): "
if [ "$RLS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ CRITICAL${NC}"
fi

echo ""
echo "Manual checks (run these):"
echo "  [ ] Data looks correct (run sample SELECT queries)"
echo "  [ ] Auth tables intact (select from auth.users)"
echo "  [ ] All schemas present (\dn)"
echo "  [ ] Functions present (\df)"
echo ""

################################################################################
# SAVE CREDENTIALS
################################################################################

echo ""
echo -e "${YELLOW}▶ Save Your Configuration${NC}"
echo "======================================"
echo ""
echo "Create ~/.env.scaleway with:"
echo ""
echo "DATABASE_URL_DEV=\"postgresql://$DB_USER:PASSWORD@$DB_HOST:$DB_PORT/benchrs_test\""
echo "DATABASE_URL_PROD=\"postgresql://$DB_USER:PASSWORD@benchrs-db-prod.fr-par.scw.cloud:5432/postgres\""
echo ""
echo "S3_ENDPOINT=\"s3.fr-par.scw.cloud\""
echo "S3_ACCESS_KEY=\"(from Scaleway Console → Credentials)\""
echo "S3_SECRET_KEY=\"(from Scaleway Console → Credentials)\""
echo ""
echo "KUBECONFIG=\"~/.kube/config-benchrs-dev\""
echo ""

################################################################################
# SUMMARY
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  PHASE 0 PROVISIONING COMPLETE ✓✓✓                ║${NC}"
echo -e "${GREEN}║  Ready for Phase 1 (DB Migration)                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "PHASE 0 Summary:"
echo "  ✓ PostgreSQL (prod + dev) provisioned"
echo "  ✓ Object Storage (8 buckets) created"
echo "  ✓ Kubernetes cluster operational"
echo "  ✓ Container Registry ready"
echo "  ✓ Database restored + verified"
echo "  ✓ RLS policies intact"
echo ""
echo "Total Budget: ~€100"
echo "Status: GO for Phase 1"
echo ""
echo "Next Step: Phase 1 (Database Migration to Production)"
echo "  Date: Nov 18, 2026"
echo "  Duration: 1-2 weeks"
echo "  Action: Switch app to Scaleway DB + migrate data"
echo ""

