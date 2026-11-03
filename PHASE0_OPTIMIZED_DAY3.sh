#!/bin/bash
################################################################################
# PHASE 0 — DAY 3: Database Setup + Dump from Supabase
# Use existing PostgreSQL S1 (no new cost!)
# Time: 2 hours
# Prerequisites: psql + pg_dump installed
################################################################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 3: DB Dump from Supabase                      ║${NC}"
echo -e "${GREEN}║  Cost: €0 (using existing PostgreSQL S1)          ║${NC}"
echo -e "${GREEN}║  Time: 2 hours (mostly pg_dump)                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

################################################################################
# STEP 1: Verify Tools
################################################################################

echo ""
echo -e "${YELLOW}▶ STEP 1: Verify PostgreSQL Tools${NC}"
echo "======================================"

if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ psql not found${NC}"
    echo "Install: sudo apt-get install postgresql-client"
    exit 1
fi
echo -e "${GREEN}✓ psql installed${NC}"

if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}❌ pg_dump not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ pg_dump installed${NC}"

echo ""

################################################################################
# STEP 2: Get Supabase Connection String
################################################################################

echo -e "${YELLOW}▶ STEP 2: Get Supabase Connection String${NC}"
echo "======================================"
echo ""
echo -e "${BLUE}MANUAL STEP:${NC}"
echo "  1. Go to https://app.supabase.com"
echo "  2. Select your project"
echo "  3. Settings → Database"
echo "  4. Copy the connection string"
echo ""
echo "It looks like:"
echo "  postgresql://postgres:PASSWORD@db.supabase.co:5432/postgres"
echo ""

read -p "Paste your Supabase connection string: " SUPABASE_URL
export SUPABASE_URL

echo ""
echo -e "${GREEN}✓ Connection string saved${NC}"
echo ""

################################################################################
# STEP 3: Test Supabase Connection
################################################################################

echo -e "${YELLOW}▶ STEP 3: Test Supabase Connection${NC}"
echo "======================================"
echo ""

if PGPASSWORD="" psql "$SUPABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Supabase connection OK${NC}"
else
    echo -e "${YELLOW}⚠️  Connection test failed (might need password)${NC}"
    echo "Continuing anyway..."
fi

echo ""

################################################################################
# STEP 4: Dump Supabase Database
################################################################################

echo -e "${YELLOW}▶ STEP 4: Dump Supabase Database${NC}"
echo "======================================"
echo ""
echo "Starting pg_dump..."
echo "This may take 5-15 minutes depending on database size"
echo ""

DUMP_FILE="$HOME/benchrs_supabase_dump.bak"

pg_dump "$SUPABASE_URL" \
  -F custom \
  -b \
  -v \
  --no-owner \
  > "$DUMP_FILE"

echo ""
echo -e "${GREEN}✓ Dump complete${NC}"
echo ""

# Verify dump
if [ -f "$DUMP_FILE" ]; then
    DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    echo "Dump file: $DUMP_FILE"
    echo "Size: $DUMP_SIZE"
    echo -e "${GREEN}✓ Dump file verified${NC}"
else
    echo -e "${RED}❌ Dump file not created${NC}"
    exit 1
fi

echo ""

################################################################################
# STEP 5: Get Scaleway PostgreSQL Connection
################################################################################

echo -e "${YELLOW}▶ STEP 5: Get Scaleway PostgreSQL Details${NC}"
echo "======================================"
echo ""
echo "Your PostgreSQL S1 instance is already running"
echo ""
echo -e "${YELLOW}Connection details:${NC}"
echo "  Instance: benchrs-db-dev (S1)"
echo "  Host: (check Scaleway Console)"
echo "  User: root"
echo "  Port: 5432"
echo ""
echo "To get exact host/port:"
echo "  1. https://console.scaleway.com → Databases"
echo "  2. Click your PostgreSQL S1 instance"
echo "  3. Copy the Connection String"
echo ""

read -p "Enter PostgreSQL S1 connection string: " SCALEWAY_URL
export SCALEWAY_URL

echo ""

################################################################################
# STEP 6: Test Scaleway Connection
################################################################################

echo -e "${YELLOW}▶ STEP 6: Test Scaleway PostgreSQL Connection${NC}"
echo "======================================"
echo ""

if psql "$SCALEWAY_URL" -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Scaleway PostgreSQL connection OK${NC}"
else
    echo -e "${RED}❌ Connection failed${NC}"
    echo "Check your connection string and password"
    exit 1
fi

echo ""

################################################################################
# STEP 7: Create Databases
################################################################################

echo -e "${YELLOW}▶ STEP 7: Create Databases in Scaleway PostgreSQL${NC}"
echo "======================================"
echo ""

echo "Creating database 'benchrs_dev'..."
psql "$SCALEWAY_URL" -c "CREATE DATABASE benchrs_dev;" 2>/dev/null || echo "⚠️  Database may already exist"

echo "Creating database 'benchrs_prod'..."
psql "$SCALEWAY_URL" -c "CREATE DATABASE benchrs_prod;" 2>/dev/null || echo "⚠️  Database may already exist"

echo ""
echo "Databases created:"
psql "$SCALEWAY_URL" -c "\l benchrs"

echo ""

################################################################################
# SUMMARY
################################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DAY 3 COMPLETE ✓                                  ║${NC}"
echo -e "${GREEN}║  Supabase dump ready (${DUMP_SIZE})                       ║${NC}"
echo -e "${GREEN}║  Scaleway PostgreSQL S1 prepared                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"

echo ""
echo "Dump file saved to: $DUMP_FILE"
echo ""
echo "Next: DAY 4 - Restore dump + Validation"
echo ""

