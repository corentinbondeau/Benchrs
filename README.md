# SportPlus

Application de gestion d'équipe de football amateur.

## Stack Technique

- **Framework** : Next.js 16 (App Router, TypeScript)
- **UI** : Tailwind CSS + shadcn/ui
- **Base de données** : Supabase (PostgreSQL + Realtime)
- **Auth** : NextAuth.js v5 (JWT)
- **Deploy** : Vercel

## Démarrage

```bash
npm install
cp .env.example .env.local
# Configurer les variables d'environnement
npm run dev
```

## Base de Données

Le fichier SQL complet se trouve dans `supabase/migrations/001_initial_schema.sql`. 
Exécuter ce fichier dans l'éditeur SQL de Supabase pour créer toutes les tables.

## Fonctionnalités

- Tableau de bord avec compte à rebours
- Présences & synchronisation SportEasy
- Notifications push & email
- Statistiques générales et personnelles
- Gestion tactique (terrain drag-and-drop)
- Chat en temps réel
- Covoiturage
- Infirmerie & forme physique
- Trophées & MOTM
