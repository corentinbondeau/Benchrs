# Fragment — components-ui
> Genere par @init_project le 2026-08-24
> Derniere mise a jour : 2026-08-24
> Module path : src/components/ui/

## Responsabilite
Composants UI shadcn/ui : primitives de l'interface (boutons, dialogues, formulaires, etc.).

## Patterns
- Composants generes via `npx shadcn add <component>`
- Utilisent `class-variance-authority` (cva) pour les variants
- `cn()` helper (clsx + tailwind-merge) pour les classes conditionnelles
- Config : `components.json` a la racine

## Points d'attention
- Ne pas modifier ces fichiers directement — regenerer via shadcn CLI si besoin
- Tailwind CSS v4 (nouvelle syntaxe, pas de `tailwind.config.js`)
