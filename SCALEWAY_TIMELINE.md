# 📅 Scaleway Migration — Complete Timeline

**Start Date:** Nov 3, 2026  
**Target Deployment:** Q1 2027 (Jan-Feb 2027)  
**Total Duration:** 8-10 weeks

---

## 🎯 Gantt Chart (High Level)

```
Week 1-2   | ████████ | Phase 0: Preparation (Infra Provisioning)
Week 3     | ████████ | Phase 1: DB Migration (Dump → Restore)
Week 4     | ████     | Phase 2: Storage Migration (S3 Sync)
Week 5-7   | ████████████ | Phase 3: App Migration (K8s Deployment)
Week 8-9   | ████████ | Phase 4: AI Worker (Elastic Metal + YOLO)
Week 9-10  | ████████ | Phase 5-6: CI/CD + DOFA Proxy
Week 10-11 | ████████ | Phase 7: Validation + Decommissioning
           | ████████ | Production Deployment

Timeline: 10-11 weeks to full production migration
```

---

## 📋 Detailed Week-by-Week Plan

### **WEEK 1-2: Phase 0 — PREPARATION**

#### Week 1
- **Mon:** Scaleway account creation + CLI setup (Day 1)
- **Tue-Wed:** Infrastructure provisioning (Day 2)
  - PostgreSQL (prod + dev)
  - Object Storage (4 buckets × 2 = 8 buckets)
  - Kubernetes Kapsule cluster
  - Container Registry namespace
- **Thu:** Dump/restore testing starts (Day 3)
- **Fri:** .env.scaleway setup + validation (Day 4)

#### Week 2
- **Mon-Wed:** Complete all dump/restore validation
- **Thu:** Final checklist + Go/No-Go decision
- **Fri:** Buffer day + stakeholder approval

**Status:** GO to Phase 1 ✅

**Deliverables:**
- ✅ Scaleway infra provisioned
- ✅ Dump/restore validated
- ✅ .env.scaleway created
- ✅ Validation 100% green

**Costs:** ~€100

---

### **WEEK 3: Phase 1 — DATABASE MIGRATION**

#### Mon: Dump from Supabase
- Full database dump (50-150 MB)
- Backup PITR snapshot on Supabase
- Verify dump integrity

#### Tue-Wed: Restore to Scaleway
- Create `benchrs` database on prod instance
- pg_restore full dump
- Validate table count + RLS policies
- Test login (JWT auth)

#### Thu: Validation + Cutover Prep
- Run all integrity checks
- Verify RLS enforcement
- Update .env with Scaleway DATABASE_URL
- Keep Supabase as fallback

#### Fri: Buffer + Testing
- Load testing on restored DB
- Index optimization if needed
- Backup Scaleway snapshot (PITR enabled)

**Status:** Phase 1 COMPLETE ✅

**Deliverables:**
- ✅ Full DB on Scaleway PostgreSQL
- ✅ RLS policies preserved
- ✅ Auth functional
- ✅ Daily backups enabled

**Costs:** ~€100-150

---

### **WEEK 4: Phase 2 — STORAGE MIGRATION**

#### Mon-Tue: S3 Sync
- Configure s3cmd for Supabase endpoint
- Sync all 4 buckets to Scaleway:
  - documents (100 MB)
  - gallery (500 MB)
  - club_sponsors (50 MB)
  - profiles (100 MB)
- Total: ~750 MB transfer
- Verify checksums

#### Wed-Thu: Code Updates
- Update src/lib/storage.ts URLs
- Test signedUrl generation
- Test public URL access
- Verify gallery image loading

#### Fri: Validation + Cutover
- Spot-check 10 files per bucket
- Test uploads to new buckets
- Document any URL pattern changes
- Prepare rollback plan

**Status:** Phase 2 COMPLETE ✅

**Deliverables:**
- ✅ All files in Scaleway S3
- ✅ URLs verified working
- ✅ SignedURLs functional
- ✅ Code updated

**Costs:** ~€20-50

---

### **WEEK 5-7: Phase 3 — APP MIGRATION TO KUBERNETES**

#### Week 5: Docker & Helm
- **Mon:** Build & test Dockerfile locally
- **Tue:** Push image to Scaleway Registry
- **Wed-Thu:** Create Helm values + test locally (via minikube)
- **Fri:** Deploy to dev K8s cluster (benchrs-cluster-dev)

#### Week 6: App Deployment
- **Mon-Tue:** Test app on K8s (dev cluster)
  - Database connectivity ✓
  - Storage access ✓
  - Login functionality ✓
  - API calls ✓
- **Wed:** Configure DNS + LoadBalancer
  - Create A record: benchrs.app → LB IP
  - Generate SSL cert (Let's Encrypt)
  - Test HTTPS
- **Thu:** Deploy CronJobs
  - notifications (14:00 UTC daily)
  - rgpd-purge (03:00 UTC Sunday)
- **Fri:** Staging validation

#### Week 7: Production Readiness
- **Mon-Tue:** Load testing (1000 concurrent users)
- **Wed-Thu:** Blue/green deployment prep
  - Keep Vercel as fallback (DNS weight 10%)
  - K8s as primary (DNS weight 90%)
- **Fri:** Gradual traffic shift
  - Monitor errors + latency
  - Scale to production node count (3 replicas)

**Status:** Phase 3 COMPLETE ✅

**Deliverables:**
- ✅ App running on K8s
- ✅ DNS + SSL configured
- ✅ CronJobs scheduled
- ✅ Load testing passed
- ✅ Vercel fallback ready

**Costs:** ~€300-500/month

---

### **WEEK 8-9: Phase 4 & 5 — AI WORKER + PROXY**

#### Week 8: Elastic Metal GPU Setup
- **Mon:** Provision Elastic Metal (GPU-3090)
- **Tue-Wed:** Install nvidia-docker2 + CUDA drivers
- **Thu:** Build + deploy YOLO worker Docker image
- **Fri:** Test video analysis (end-to-end)

#### Week 9: Redis Queue + DOFA Proxy
- **Mon-Tue:** Deploy Redis on K8s
- **Wed:** Integrate Bull.js queue (app → worker)
- **Thu:** Deploy DOFA Proxy (Cloudflare → Serverless Functions)
- **Fri:** End-to-end testing

**Status:** Phase 4-5 COMPLETE ✅

**Deliverables:**
- ✅ AI Worker analyzing videos
- ✅ Job queue functional
- ✅ DOFA Proxy live
- ✅ Callbacks working

**Costs:** +€200-400/month (Elastic Metal GPU)

---

### **WEEK 9-10: Phase 6 — CI/CD AUTOMATION**

#### Mon-Tue: GitLab CI Setup
- Create `.gitlab-ci.yml` (build → test → deploy)
- Configure Scaleway Container Registry auth
- Test build pipeline locally

#### Wed-Thu: Automate Deployments
- Push triggers Helm deployment to K8s
- Deploy to staging on every PR
- Deploy to production on main merge

#### Fri: Validation + Documentation
- Test full CI/CD flow (git push → app update)
- Document pipeline stages
- Create runbooks

**Status:** Phase 6 COMPLETE ✅

**Deliverables:**
- ✅ `.gitlab-ci.yml` working
- ✅ Automated builds
- ✅ Auto-deploy to staging
- ✅ Auto-deploy to production

**Costs:** €0 (GitLab free tier)

---

### **WEEK 10-11: Phase 7 — VALIDATION + CUTOVER**

#### Week 10: Final Validation
- **Mon-Wed:** Production monitoring (latency, errors, CPU)
- **Thu:** Vercel failover test (simulate K8s outage)
- **Fri:** Team sign-off meeting

#### Week 11: Final Cutover
- **Mon-Tue:** Remove Vercel DNS weight (100% → K8s)
- **Wed-Thu:** Monitor for 48h (any issues?)
- **Fri:** Decommission Vercel + Supabase

**Status:** PRODUCTION LIVE ✅

**Deliverables:**
- ✅ App fully on Scaleway
- ✅ Zero downtime achieved
- ✅ Vercel + Supabase stopped (save €200-400/month)
- ✅ All systems stable

**Costs:** -€200-400/month (savings)

---

## 💰 Cost Breakdown

### Phase 0: Preparation
```
PostgreSQL (2×2 weeks)        €40
Object Storage (100 MB)        €2
Kubernetes (dev)              €60
Total                         €100
```

### Phase 1: DB Migration
```
PostgreSQL increased load     €50
Bandwidth (dump)              €0 (internal)
Total                         €50-100
```

### Phase 2: Storage Migration
```
S3 sync (750 MB)             €20
Storage (750 MB ongoing)      €3/week
Total                         €20-50
```

### Phase 3-7: Production
```
Kubernetes (3 nodes)         €300-400
PostgreSQL (production)       €50-100
Object Storage               €15-30
Elastic Metal GPU            €200-400
DNS/LB                       €20-50
Bandwidth                    €100-200
Total                        €685-1180/month
```

### Phase 7: Decommissioning
```
Vercel shutdown              -€50-200
Supabase shutdown            -€100-200
Savings                      -€150-400/month
```

### Long-term Optimization
```
With reserved instances (-30%)
With dynamic scaling (nodes)
With batch video processing
Potential: €500-800/month
```

---

## 🎯 Key Milestones

| Date | Milestone | Status |
|------|-----------|--------|
| Nov 3 | Migration plan complete | ✅ |
| Nov 17 | Phase 0 complete (infra ready) | ⏳ |
| Nov 24 | Phase 1 complete (DB live) | ⏳ |
| Dec 1 | Phase 2 complete (storage live) | ⏳ |
| Dec 22 | Phase 3 complete (app on K8s) | ⏳ |
| Jan 5 | Phase 4-6 complete (workers + CI/CD) | ⏳ |
| Jan 12 | Phase 7 complete (production) | ⏳ |

---

## ⚠️ Critical Path

**If any of these slip, entire timeline shifts:**

1. **Scaleway infra provisioning** (Week 1-2)
   - Blocker: Database not available → can't test dump/restore
   
2. **DB migration validation** (Week 3)
   - Blocker: RLS broken → auth fails → must rollback
   
3. **App deployment to K8s** (Week 5-7)
   - Blocker: Pods not healthy → scale-up fails → production not ready

4. **Load testing passed** (Week 7)
   - Blocker: Latency > 100ms p95 → need optimization → weeks delay

---

## 🚨 Risk Buffer

**Built-in buffers:**
- End of Week 2: 1 day buffer (Phase 0)
- End of Week 4: 1 day buffer (Phase 2)
- End of Week 7: 1 week buffer (Phase 3 validation)
- End of Week 10: 1 week buffer (Phase 7 cutover)

**Total buffer:** ~2-3 weeks of slack

---

## 📞 Communication Plan

### Weekly Stakeholder Updates
- **Every Friday:** Migration status email
- **Every 2 weeks:** All-hands presentation
- **Before/after Phase 7:** Executive briefing

### Issue Escalation
- **Critical:** Notify team lead immediately
- **High:** Daily standup
- **Medium:** Weekly update
- **Low:** In retro

---

**Document Updated:** Nov 3, 2026  
**Next Review:** Nov 10, 2026 (end of Week 1)  
**Status:** Ready for Phase 0 execution

