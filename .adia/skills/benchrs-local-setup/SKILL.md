---
name: benchrs-local-setup
description: Lancer Benchrs en local
generated_by: init_project
generated_at: 2026-08-18
project: benchrs
---

## Objectif
Démarrer le projet Benchrs en développement local.

## Procédure
1. Installer les dépendances : `npm install`
2. Copier le template d'env : `cp .env.example .env.local`
3. Configurer les variables requises dans `.env.local` :
   - `NEXT_PUBLIC_SUPABASE_URL` (obligatoire, build échoue sans)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (obligatoire)
   - `SUPABASE_SERVICE_ROLE_KEY` (obligatoire pour les API routes)
   - `OLLAMA_URL` (optionnel, pour les fonctionnalités IA — défaut : `http://localhost:11434`)
   - `AI_MODEL` (optionnel, modèle Ollama — défaut : `llama3.1:8b`)
4. Lancer le serveur : `npm run dev`
5. Ouvrir `http://localhost:3000`

## Commandes utiles
- `npm run dev` — serveur de développement (port 3000)
- `npm run build` — build production
- `npm run start` — serveur de production
- `npm run lint` — ESLint
- `npx tsc --noEmit` — typecheck

## Notes
- Pas de base de données locale — pointe vers Supabase cloud
- Les migrations SQL sont dans `supabase/migrations/` (à exécuter manuellement)
- Les VAPID keys ont un fallback hardcodé (push fonctionne sans config)
