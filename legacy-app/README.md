# Benchrs — legacy-app (fork downgradé)

Copie complète de l'application Benchrs, buildée avec des versions plus
anciennes pour tourner sur vieux navigateurs (iPhone 7 / iOS ≤14, vieux
Safari, Android ≤8).

- **Next.js** 14.2 (vs 16 sur l'app principale)
- **React** 18.3 (vs 19)
- **Tailwind CSS** 3.4 (vs 4) — c'est le changement clé : Tailwind 4 émettait
  du CSS non supporté par iOS ≤14 (`color-mix`, `oklch`, `@layer`, `:has`).

Le fork suit l'app principale avec un décalage : il n'est pas mis à jour en
continu, seulement lors de portages ponctuels. Les deux apps partagent la
**même base Supabase** — toute migration ajoutant une contrainte (trigger,
colonne obligatoire, RLS) doit être répercutée dans les deux apps. Ce fork
n'a **ni tests ni CI**.

---

## Déploiement sur Vercel

Ce projet vit dans le sous-dossier `legacy-app/` d'un repo monorepo. Pour le
déployer comme un site séparé (URL dédiée) :

### 1. Créer un nouveau projet Vercel
- Vercel → **Add New… → Project** → importer le repo `corentinbondeau/Benchrs`.
- **Root Directory** : cliquer **Edit** et sélectionner **`legacy-app`**. ← étape essentielle.
- Framework Preset : **Next.js** (détecté automatiquement).
- Build Command : `next build` (par défaut). Output : `.next` (par défaut).

### 2. Variables d'environnement
Dans **Project → Settings → Environment Variables**, ajouter (cf. `.env.example`) :

| Variable | Requis | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Clé anonyme Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Clé service role (serveur) |
| `CRON_SECRET` | ✅ (si crons) | Secret des cron jobs |
| `MISTRAL_API_KEY`, `AI_*`, `OLLAMA_URL` | ⬜ | IA (optionnel) |
| `SMTP_*` | ⬜ | Emails (optionnel) |

> Astuce : ces valeurs sont les **mêmes** que celles du projet Vercel principal.
> Tu peux les recopier depuis le projet Benchrs existant.

### 3. Déployer
- **Deploy**. Vercel build le sous-dossier et fournit une URL du type
  `https://benchrs-legacy-app.vercel.app` (personnalisable dans Settings → Domains).

### Notes
- Le fichier `.env.production` versionné ne contient que des **placeholders**
  (pour que le build passe sans réseau) ; Vercel utilisera les variables
  définies dans l'UI, qui ont priorité.
- Les crons ne sont **pas** déclarés ici (`vercel.json` n'a pas de bloc
  `crons`) : ils tournent uniquement sur l'app principale, pour éviter les
  notifications en double.

---

## Lancer en local

```bash
cd legacy-app
cp .env.example .env.local   # puis renseigner les vraies clés
npm install
npm run dev                  # http://localhost:3000
# ou : npm run build && npm start
```
