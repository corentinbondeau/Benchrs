# Migration Vercel+Supabase → Vercel+Scaleway DB (Zero Cost)

> **Timeline:** Nov 4-5, 2026 (4-6 hours total)  
> **Cost:** €0 additional (reuse PostgreSQL S1 already paid)  
> **Risk:** Very low (easy rollback to Supabase)  
> **Status:** Ready to execute

---

## What's Changing

| Component | Before | After | Cost |
|-----------|--------|-------|------|
| App Server | Vercel | Vercel | €0 (no change) |
| Database | Supabase | Scaleway PostgreSQL S1 | €0 (already paid) |
| File Storage | Supabase Storage (free 1GB) | Keep Supabase Storage | €0 (no change) |
| Cron Jobs | Vercel | Vercel | €0 (no change) |

**Total Change:** Just the database connection string. Everything else stays the same.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Vercel (Serverless App)                                         │
│ ├─ /api/cron/notifications        (14:00 UTC daily)            │
│ ├─ /api/cron/rgpd-purge           (03:00 UTC Sunday)           │
│ └─ All other routes                                             │
│     ↓↓↓                                                         │
│ DATABASE_URL = postgresql://...@scaleway...                     │
└─────────────────────────────────────────────────────────────────┘
            ║
            ║ HTTPS / TCP 5432
            ║
┌─────────────────────────────────────────────────────────────────┐
│ Scaleway PostgreSQL S1 (€1.22/month - already paid)             │
│ ├─ benchrs (production database)                                │
│ ├─ benchrs_dev (dev database)                                   │
│ └─ PostgreSQL extensions (uuid, jwt, etc.)                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Supabase Storage (Backup - free 1GB)                            │
│ ├─ Keep for 1-2 weeks as backup                                │
│ └─ Then can delete                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Execution

### Day 1: Preparation & Testing (2-3 hours)

#### Step 1: Get Scaleway PostgreSQL Connection String

```bash
# From Scaleway Console:
# 1. Go to https://console.scaleway.com
# 2. Databases → PostgreSQL
# 3. Click your PostgreSQL S1 instance (benchrs-db-dev)
# 4. Copy the Connection String
#
# Format:
# postgresql://root:PASSWORD@benchrs-db-dev.fr-par.scw.cloud:5432/postgres
```

**Save this string** (you'll need it multiple times).

#### Step 2: Test Connection Locally

```bash
# Install PostgreSQL client if needed:
# macOS: brew install postgresql
# Ubuntu: sudo apt-get install postgresql-client

# Test connection from your computer:
psql "postgresql://root:PASSWORD@benchrs-db-dev.fr-par.scw.cloud:5432/postgres"

# If successful, you'll see:
# postgres=> 
# Type \q to exit
```

If this fails:
- Check password is correct (Scaleway Console → Instance details)
- Check firewall (Scaleway Console → Security Groups)
- Verify instance status is "Ready"

#### Step 3: Create `benchrs` Database in Scaleway

Connect and create the production database:

```bash
# Connect to PostgreSQL
psql "postgresql://root:PASSWORD@benchrs-db-dev.fr-par.scw.cloud:5432/postgres"

# Inside psql:
CREATE DATABASE benchrs;

# Verify it was created:
\l

# Exit:
\q
```

#### Step 4: Dump Supabase Database

Dump your current Supabase data:

```bash
# Get Supabase connection string:
# 1. https://app.supabase.com → Your Project
# 2. Settings → Database → Connection String
# 3. Copy it

# Dump the database:
pg_dump "postgresql://postgres:PASSWORD@db.supabase.co:5432/postgres" \
  -F custom -b -v --no-owner \
  > ~/benchrs_supabase_backup.bak

# Verify dump:
du -h ~/benchrs_supabase_backup.bak
# Should show something like: 50M, 100M, etc.
```

#### Step 5: Restore to Scaleway Database

Restore the Supabase dump to your Scaleway PostgreSQL:

```bash
# Restore the dump:
pg_restore \
  ~/benchrs_supabase_backup.bak \
  -d benchrs \
  -h benchrs-db-dev.fr-par.scw.cloud \
  -U root \
  -v \
  --no-owner

# This will take 5-15 minutes depending on database size
# You'll see progress: [TOC], [SCHEMA], [COMMENT], etc.
```

#### Step 6: Verify Restoration

Check that all data was restored correctly:

```bash
# Connect to Scaleway benchrs database:
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs

# Check tables:
SELECT count(*) FROM information_schema.tables 
WHERE table_schema='public';

# Should return a number > 0 (e.g., 45 tables)

# Check RLS policies (CRITICAL):
SELECT count(*) FROM pg_policies;

# Should return > 0 (e.g., 28 policies)
# If this returns 0, RLS policies were NOT restored!
# This is a BLOCKER - see Troubleshooting below

# Exit:
\q
```

**⚠️ CRITICAL:** If RLS policies count is 0, STOP here and see "RLS Policies Lost" in Troubleshooting.

#### Step 7: Get Final Connection String

You'll use this in Vercel `.env`:

```bash
# Format:
postgresql://root:PASSWORD@benchrs-db-dev.fr-par.scw.cloud:5432/benchrs
#                                                                    ^^^ this is the database name
```

**Save this** - you'll need it for Vercel deployment.

---

### Day 2: Deploy to Vercel (1-2 hours)

#### Step 1: Update Vercel Environment Variables

```bash
# Option A: Via Vercel CLI (recommended)
vercel env add DATABASE_URL

# When prompted, paste:
# postgresql://root:PASSWORD@benchrs-db-dev.fr-par.scw.cloud:5432/benchrs

# Option B: Via Web Console
# 1. https://vercel.com/dashboard
# 2. Select your project (benchrs)
# 3. Settings → Environment Variables
# 4. Add new variable:
#    Name: DATABASE_URL
#    Value: postgresql://root:PASSWORD@...
#    Environments: Production, Preview, Development
```

#### Step 2: Deploy to Vercel

```bash
# Push code changes (if any):
git add .env.local
git commit -m "chore: update DATABASE_URL to Scaleway PostgreSQL"
git push origin main

# Vercel auto-deploys, or manually trigger:
vercel --prod

# Watch the deployment:
# 1. https://vercel.com/dashboard → your project
# 2. Should say "✓ Production"
```

#### Step 3: Verify App is Running

```bash
# Test the app:
# 1. Open https://benchrs.vercel.app (or your domain)
# 2. Check homepage loads
# 3. Try logging in
# 4. Check if notifications/data load correctly
```

#### Step 4: Test Crons Manually

Crons run at:
- 14:00 UTC daily (notifications)
- 03:00 UTC Sunday (RGPD purge)

To test before waiting:

```bash
# Get your CRON_SECRET from Vercel:
# https://vercel.com/dashboard → Settings → Environment Variables
# Look for CRON_SECRET

# Test notifications cron:
curl -X GET https://benchrs.vercel.app/api/notifications/cron \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Response should show:
# { "ok": true, "delivery": {...}, "creation": {...}, ... }

# Test RGPD cron:
curl -X GET https://benchrs.vercel.app/api/cron/rgpd-purge \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Response should show:
# { "ok": true, "result": {...} }
```

If crons return errors, check:
- CRON_SECRET is set in Vercel
- DATABASE_URL is correct
- PostgreSQL is accessible from Vercel (should be - it's in same cloud region)

---

### Day 3: Monitoring & Cleanup (1-2 hours)

#### Step 1: Monitor for 24 Hours

Watch that everything works:

```bash
# Check Vercel logs:
# 1. https://vercel.com/dashboard → your project
# 2. Deployments → last deployment → Logs
# 3. Look for any errors

# Check Scaleway PostgreSQL:
# 1. https://console.scaleway.com → Databases
# 2. benchrs-db-dev → Logs
# 3. Look for connection errors
```

#### Step 2: Verify Crons Executed

After 14:00 UTC (or 03:00 UTC Sunday):

```bash
# Check that crons actually executed:
# In your app UI, check:
# 1. Users received notifications (14:00 UTC)
# 2. Old data was purged (03:00 UTC Sunday)
# 3. No errors in Vercel logs

# Or check database directly:
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs -c \
  "SELECT count(*) FROM notifications WHERE delivered_at IS NOT NULL AND created_at > NOW() - INTERVAL '1 hour'"

# Should return > 0 if notifications were delivered
```

#### Step 3: Keep Supabase as Backup (1-2 weeks)

Do NOT delete Supabase yet. Keep it as backup:

```bash
# On Supabase:
# 1. https://app.supabase.com → your project
# 2. Settings → Billing
# 3. DO NOT click "Delete Project"
# 4. Keep it running for 1-2 weeks as insurance
```

After 1-2 weeks, if everything is stable:

```bash
# Delete Supabase (optional):
# 1. https://app.supabase.com → your project
# 2. Settings → Danger Zone
# 3. Click "Delete Project"
# 4. Confirm deletion
```

#### Step 4: Rollback Plan (if needed)

If something breaks, rollback is simple:

```bash
# Revert to Supabase in 2 minutes:
# 1. Vercel Dashboard → Settings → Environment Variables
# 2. Change DATABASE_URL back to Supabase connection string
# 3. Deploy: vercel --prod
# 4. Done - app is back on Supabase
```

---

## Checklist

### Day 1: Preparation
- [ ] Get Scaleway PostgreSQL connection string
- [ ] Test connection locally with `psql`
- [ ] Create `benchrs` database in Scaleway
- [ ] Dump Supabase database (check file size > 0)
- [ ] Restore to Scaleway (monitor progress)
- [ ] Verify tables exist (count > 0)
- [ ] Verify RLS policies exist (count > 0)
- [ ] Get final connection string

### Day 2: Deployment
- [ ] Add DATABASE_URL to Vercel environment
- [ ] Deploy to Vercel production
- [ ] App loads on production domain
- [ ] Test login/basic functionality
- [ ] Test notifications cron manually
- [ ] Test RGPD cron manually

### Day 3: Monitoring
- [ ] Monitor Vercel logs for 24h
- [ ] Crons executed at scheduled times
- [ ] No database connection errors
- [ ] Keep Supabase as backup
- [ ] Plan Supabase deletion (2+ weeks later)

---

## Troubleshooting

### "Connection refused" from Vercel

**Cause:** Scaleway firewall blocking Vercel IPs

**Solution:**
```bash
# Add Vercel IPs to Scaleway Security Group:
# 1. https://console.scaleway.com → Databases → benchrs-db-dev
# 2. Security Groups → Create/Edit rules
# 3. Add source IPs:
#    - Vercel global IPs (or 0.0.0.0/0 for testing, then restrict)
#    - Port 5432 (PostgreSQL)
```

### "RLS Policies Lost" (Critical!)

**Cause:** pg_dump didn't export RLS policies

**Solution:** Re-dump with RLS:
```bash
# Full dump WITH RLS:
pg_dump "postgresql://postgres:PASSWORD@db.supabase.co:5432/postgres" \
  -F custom -b -v --no-owner --include-acls \
  > ~/benchrs_supabase_backup_with_rls.bak

# Then restore:
pg_restore ~/benchrs_supabase_backup_with_rls.bak \
  -d benchrs -h benchrs-db-dev.fr-par.scw.cloud -U root -v --no-owner
```

### Cron Returns 401 (Unauthorized)

**Cause:** CRON_SECRET not set or wrong

**Solution:**
```bash
# Verify CRON_SECRET is in Vercel:
# 1. Vercel Dashboard → Settings → Environment Variables
# 2. Should see CRON_SECRET with a value
# 3. Make sure it matches what you're sending in curl

# Get the secret:
CRON_SECRET=$(vercel env ls | grep CRON_SECRET)
echo $CRON_SECRET

# Use it in curl:
curl -X GET https://benchrs.vercel.app/api/notifications/cron \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Cron Timeout (takes >60s)

**Cause:** Database query is slow or network latency

**Solution:**
```bash
# Check query performance:
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs -c \
  "EXPLAIN ANALYZE SELECT * FROM notifications WHERE delivered_at IS NULL LIMIT 100"

# Optimize slow queries (add indexes):
psql -h benchrs-db-dev.fr-par.scw.cloud -U root -d benchrs -c \
  "CREATE INDEX idx_notifications_delivered ON notifications(delivered_at)"

# Restart cron:
# It will auto-retry at next scheduled time
```

### Data Looks Wrong After Restore

**Cause:** Partial restore or data corruption

**Solution:**
```bash
# Compare row counts:
# Before (from Supabase):
# SELECT count(*) FROM users;  # e.g., 1,000

# After (Scaleway):
# psql -h ... -d benchrs -c "SELECT count(*) FROM users;"
# Should be the same: 1,000

# If different, re-dump and restore
# Make sure you're not in the middle of an active backup
```

---

## Cost Summary

| Component | Cost | Notes |
|-----------|------|-------|
| Vercel | €0/month | App server (free hobby tier) |
| Scaleway PostgreSQL S1 | €1.22/month | Already paid - reusing |
| Supabase Storage | €0/month | Free tier 1GB (keep as backup) |
| Supabase Database | €0/month | After deletion (keep 1-2 weeks backup) |
| **Total** | **€1.22/month** | ✅ No additional cost |

---

## Timeline

| When | What | Time | Cost |
|------|------|------|------|
| Day 1 | Prep + test + dump + restore | 2-3h | €0 |
| Day 2 | Deploy to Vercel + test crons | 1-2h | €0 |
| Day 3 | Monitor 24h + backup plan | 1h | €0 |
| **Total** | Ready for production | **4-6h** | **€0** |

---

## Next Steps (After Successful Migration)

1. **Keep Supabase backup:** 1-2 weeks overlap for safety
2. **Archive Supabase:** After 2 weeks, delete the Supabase project (saves cost if you were paying)
3. **Monitor regularly:** Check Vercel logs weekly for errors
4. **Scale later:** If you need more performance:
   - Option A: Add Compute Instances (€5-15/month each)
   - Option B: Upgrade PostgreSQL to larger instance

---

## Questions?

- **Vercel docs:** https://vercel.com/docs/cron-jobs
- **Scaleway docs:** https://www.scaleway.com/en/docs/
- **PostgreSQL docs:** https://www.postgresql.org/docs/

