---
name: benchrs-pre-commit
description: Configuration de pre-commit hooks pour Benchrs
generated_by: init_project
generated_at: 2026-08-18
project: benchrs
---

## Objectif
Ajouter des hooks pre-commit pour garantir la qualité avant chaque commit.

## Procédure recommandée
1. Installer Husky : `npx husky init`
2. Installer lint-staged : `npm install --save-dev lint-staged`
3. Configurer dans `package.json` :
```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```
4. Configurer le hook : `echo "npx lint-staged" > .husky/pre-commit`

## Outils recommandés
- **Prettier** : `npm install --save-dev prettier`
- **lint-staged** : exécute lint/format uniquement sur les fichiers modifiés
- **gitleaks** (optionnel) : détection de secrets dans les commits

## Conventions Benchrs
- ESLint existant : `eslint-config-next/core-web-vitals` + TypeScript
- Indentation : 2 espaces (déduire de l'existant)
- Pas de trailing semicolons mixtes (standardiser avec Prettier)
