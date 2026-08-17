# Deploiement

## 1. Vercel (Production)

Benchrs est deploye sur **Vercel** avec l'integration GitHub automatique.

### Configuration (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/sporteasy/ical-cron", "schedule": "0 6 * * *" },
    { "path": "/api/notifications/cron", "schedule": "0 20 * * *" },
    { "path": "/api/motm/open", "schedule": "30 22 * * 0" }
  ]
}
```

| Cron | Horaire | Description |
|------|---------|-------------|
| iCal sync | 6h chaque jour | Synchronisation calendrier SportEasy |
| Notifications | 20h chaque jour | Rappels, digest, alertes echeances |
| MOTM | Dimanche 22h30 | Ouverture vote "Man of the Match" |

### Variables d'environnement Vercel

| Variable | Description | Obligatoire |
|----------|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Oui |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cle anonyme Supabase | Oui |
| `SUPABASE_SERVICE_ROLE_KEY` | Cle service role (API routes) | Oui |
| `NEXTAUTH_SECRET` | Secret NextAuth.js (32+ chars) | Oui |
| `NEXTAUTH_URL` | URL de l'application | Oui |
| `MISTRAL_API_KEY` | Cle API Mistral (features IA) | Oui |
| `VAPID_PUBLIC_KEY` | Cle publique VAPID (Web Push) | Oui |
| `VAPID_PRIVATE_KEY` | Cle privee VAPID (Web Push) | Oui |
| `SMTP_HOST` | Serveur SMTP | Oui |
| `SMTP_PORT` | Port SMTP | Oui |
| `SMTP_USER` | Utilisateur SMTP | Oui |
| `SMTP_PASS` | Mot de passe SMTP | Oui |
| `CRON_SECRET` | Secret pour authentifier les crons | Oui |

### Deploiement automatique

- **Push sur `main`** → deploiement en preview
- **Push sur `production`** → deploiement en production
- **Pull Request** → preview deploy automatique

---

## 2. Docker

### Dockerfile

Le projet inclut un **Dockerfile multi-stage** pour le deploiement containerise :

```dockerfile
# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### Build et run

```bash
# Build
docker build -t benchrs .

# Run
docker run -p 8080:8080 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  -e NEXTAUTH_SECRET=mon-secret \
  -e NEXTAUTH_URL=http://localhost:8080 \
  -e MISTRAL_API_KEY=xxx \
  benchrs
```

### Prerequis

`next.config.ts` doit contenir `output: "standalone"` (deja configure).

---

## 3. Kubernetes (Helm)

### Structure du chart

```
kubernetes/
  env/
    values-common.yaml      # Valeurs partagees
    values-review.yaml      # Environnement review
    values-integ.yaml       # Environnement integration
  Benchrs/
    Chart.yaml              # Definition du chart
    values.yaml             # Valeurs par defaut
    templates/
      _helpers.tpl          # Helpers Helm
      deployment.yaml       # Deploiement Kubernetes
      service.yaml          # Service (ClusterIP, port 8080)
      ingress.yaml          # Ingress (conditionnel)
      serviceaccount.yaml   # Service Account
      hpa.yaml              # Horizontal Pod Autoscaler
      tests/
        test-connection.yaml # Test de connexion Helm
      NOTES.txt             # Notes post-installation
```

### Installation

```bash
# Installation avec values review
helm install benchrs kubernetes/Benchrs \
  -f kubernetes/env/values-common.yaml \
  -f kubernetes/env/values-review.yaml \
  --set image.tag=latest

# Installation avec values integration (2 replicas)
helm install benchrs kubernetes/Benchrs \
  -f kubernetes/env/values-common.yaml \
  -f kubernetes/env/values-integ.yaml \
  --set image.tag=v1.0.0

# Test de connexion
helm test benchrs
```

### Environnements

| Env | Replicas | Ingress | Fichier |
|-----|----------|---------|---------|
| Review | 1 | nginx | `values-review.yaml` |
| Integration | 2 | nginx | `values-integ.yaml` |

### Port

Le service ecoute sur le **port 8080** (identique au Dockerfile).

---

## 4. Migrations Supabase

Les migrations SQL sont dans `supabase/migrations/` (76 fichiers, de 000 a 076).

### Appliquer une migration

Les migrations sont appliquees **manuellement** via le SQL Editor de Supabase Dashboard :

1. Ouvrir le projet Supabase → SQL Editor
2. Coller le contenu de la migration
3. Executer
4. Verifier les tables/policies creees

### Verifier l'etat

```sql
-- Lister les tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Verifier RLS active
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true;

-- Lister les policies
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname = 'public' ORDER BY tablename;
```

---

## 5. CI/CD (GitHub Actions)

Le fichier `.github/workflows/ci.yml` execute sur chaque push/PR :

### Job 1 : `lint-and-build`
1. `npm ci`
2. `npx tsc --noEmit` (typecheck)
3. `npm run lint` (ESLint)
4. `npm run build` (build Next.js)

### Job 2 : `e2e`
1. `npm ci`
2. `npx playwright install chromium`
3. `npx playwright test`
4. Upload du rapport en artifact si echec (7 jours)

### Secrets requis dans GitHub

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MISTRAL_API_KEY`
- `NEXTAUTH_SECRET`
