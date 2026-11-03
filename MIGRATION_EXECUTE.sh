#!/bin/bash
################################################################################
# Migration Script: Vercel+Supabase → Vercel+Scaleway DB (Zero Cost)
# Timeline: ~4-6 hours total
# Cost: €0 additional (reuse PostgreSQL S1)
################################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Migration: Vercel+Supabase → Vercel+Scaleway DB  ║${NC}"
echo -e "${GREEN}║  Cost: €0 additional | Time: 4-6 hours             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

################################################################################
# Configuration
################################################################################

read -p "$(echo -e ${BLUE}Enter your Scaleway PostgreSQL password:${NC}) " -s SCALEWAY_PASSWORD
export SCALEWAY_PASSWORD
echo ""

read -p "$(echo -e ${BLUE}Enter your Supabase connection string:${NC}) " SUPABASE_URL
export SUPABASE_URL
echo ""

SCALEWAY_HOST="benchrs-db-dev.fr-par.scw.cloud"
SCALEWAY_USER="root"
SCALEWAY_DB="benchrs"
DUMP_FILE="$HOME/benchrs_supabase_backup.bak"

################################################################################
# Step 1: Test Scaleway Connection
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 1: Test Scaleway PostgreSQL Connection${NC}"
echo "=================================================="

if PGPASSWORD="$SCALEWAY_PASSWORD" psql -h "$SCALEWAY_HOST" -U "$SCALEWAY_USER" -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Connection successful${NC}"
else
    echo -e "${RED}❌ Connection failed${NC}"
    echo "Check your password and firewall rules"
    exit 1
fi

echo ""

################################################################################
# Step 2: Create benchrs Database
################################################################################

echo -e "${YELLOW}▶ STEP 2: Create benchrs Database${NC}"
echo "=================================================="

if PGPASSWORD="$SCALEWAY_PASSWORD" psql -h "$SCALEWAY_HOST" -U "$SCALEWAY_USER" -c "CREATE DATABASE $SCALEWAY_DB;" 2>/dev/null; then
    echo -e "${GREEN}✓ Database created${NC}"
else
    echo -e "${YELLOW}⚠️  Database already exists${NC}"
fi

echo ""

################################################################################
# Step 3: Dump Supabase
################################################################################

echo -e "${YELLOW}▶ STEP 3: Dump Supabase Database${NC}"
echo "=================================================="
echo "This may take several minutes..."
echo ""

if pg_dump "$SUPABASE_URL" -F custom -b -v --no-owner > "$DUMP_FILE" 2>&1 | tail -5; then
    DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Dump successful (${DUMP_SIZE})${NC}"
else
    echo -e "${RED}❌ Dump failed${NC}"
    exit 1
fi

echo ""

################################################################################
# Step 4: Restore to Scaleway
################################################################################

echo -e "${YELLOW}▶ STEP 4: Restore to Scaleway PostgreSQL${NC}"
echo "=================================================="
echo "This may take several minutes..."
echo ""

if PGPASSWORD="$SCALEWAY_PASSWORD" pg_restore \
    "$DUMP_FILE" \
    -d "$SCALEWAY_DB" \
    -h "$SCALEWAY_HOST" \
    -U "$SCALEWAY_USER" \
    -v --no-owner 2>&1 | tail -10; then
    echo -e "${GREEN}✓ Restore successful${NC}"
else
    echo -e "${RED}❌ Restore failed${NC}"
    exit 1
fi

echo ""

################################################################################
# Step 5: Verify Restoration
################################################################################

echo -e "${YELLOW}▶ STEP 5: Verify Restoration${NC}"
echo "=================================================="

TABLE_COUNT=$(PGPASSWORD="$SCALEWAY_PASSWORD" psql -h "$SCALEWAY_HOST" -U "$SCALEWAY_USER" -d "$SCALEWAY_DB" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" -t)

echo "Tables: $TABLE_COUNT"

RLS_COUNT=$(PGPASSWORD="$SCALEWAY_PASSWORD" psql -h "$SCALEWAY_HOST" -U "$SCALEWAY_USER" -d "$SCALEWAY_DB" -c "SELECT count(*) FROM pg_policies;" -t)

echo "RLS Policies: $RLS_COUNT"

echo ""

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Tables restored${NC}"
else
    echo -e "${RED}❌ No tables found${NC}"
    exit 1
fi

if [ "$RLS_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ RLS policies preserved${NC}"
else
    echo -e "${RED}❌ RLS policies missing (CRITICAL!)${NC}"
    echo "This is a blocker. Re-dump with --include-acls flag"
    exit 1
fi

echo ""

################################################################################
# Step 6: Generate Connection String
################################################################################

echo -e "${YELLOW}▶ STEP 6: Connection String${NC}"
echo "=================================================="

CONNECTION_STRING="postgresql://${SCALEWAY_USER}:${SCALEWAY_PASSWORD}@${SCALEWAY_HOST}:5432/${SCALEWAY_DB}"

echo ""
echo "Use this in Vercel environment:"
echo ""
echo "  DATABASE_URL=${CONNECTION_STRING}"
echo ""

################################################################################
# Step 7: Update Vercel
################################################################################

echo -e "${YELLOW}▶ STEP 7: Update Vercel Environment${NC}"
echo "=================================================="

read -p "Do you want to update Vercel now? (y/N): " -n 1 UPDATE_VERCEL
echo ""

if [[ $UPDATE_VERCEL == "y" || $UPDATE_VERCEL == "Y" ]]; then
    if command -v vercel &> /dev/null; then
        echo "Adding DATABASE_URL to Vercel..."
        echo "$CONNECTION_STRING" | vercel env add DATABASE_URL -- --yes
        
        echo ""
        echo "Deploying to production..."
        vercel --prod
        
        echo -e "${GREEN}✓ Deployment complete${NC}"
    else
        echo -e "${YELLOW}⚠️  Vercel CLI not found${NC}"
        echo "Install with: npm i -g vercel"
        echo ""
        echo "Or add manually:"
        echo "  1. https://vercel.com/dashboard"
        echo "  2. Settings → Environment Variables"
        echo "  3. Add DATABASE_URL=${CONNECTION_STRING}"
        echo "  4. Redeploy"
    fi
fi

################################################################################
# Step 8: Test Crons
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 8: Test Crons (Manual)${NC}"
echo "=================================================="

read -p "Do you want to test crons now? (y/N): " -n 1 TEST_CRONS
echo ""

if [[ $TEST_CRONS == "y" || $TEST_CRONS == "Y" ]]; then
    echo ""
    echo "Get your CRON_SECRET from Vercel:"
    echo "  1. https://vercel.com/dashboard → Settings → Environment Variables"
    echo "  2. Look for CRON_SECRET"
    echo ""
    
    read -p "Enter CRON_SECRET: " CRON_SECRET
    
    echo ""
    echo "Testing notifications cron..."
    curl -X GET "https://benchrs.vercel.app/api/notifications/cron" \
        -H "Authorization: Bearer $CRON_SECRET" \
        -H "Content-Type: application/json" | jq .
    
    echo ""
    echo "Testing RGPD cron..."
    curl -X GET "https://benchrs.vercel.app/api/cron/rgpd-purge" \
        -H "Authorization: Bearer $CRON_SECRET" \
        -H "Content-Type: application/json" | jq .
fi

################################################################################
# Summary
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Migration Complete! ✓                             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "Next steps:"
echo "  1. Monitor Vercel logs for 24 hours"
echo "  2. Verify crons execute at 14:00 UTC and 03:00 UTC Sunday"
echo "  3. Keep Supabase as backup for 1-2 weeks"
echo "  4. Delete Supabase after 2 weeks (optional)"
echo ""
echo "Rollback plan (if needed):"
echo "  1. Vercel Dashboard → Settings → Environment Variables"
echo "  2. Change DATABASE_URL back to Supabase"
echo "  3. Deploy: vercel --prod"
echo ""

