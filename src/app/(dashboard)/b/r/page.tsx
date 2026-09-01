/**
 * Route COURTE `/b/r` — alias de `/championship/bookmarklet/receive`.
 *
 * ⚠️ CORRECTIF TAILLE (post-lot 8, cf. `src/lib/dofa/bookmarklet.ts`) : le
 * chemin complet `/championship/bookmarklet/receive` pesait à lui seul une
 * trentaine de caractères dans le bookmarklet généré (davantage une fois
 * encodé, chaque `/` coûtant 3 caractères en `%2F`), ce qui faisait
 * dépasser la limite de 2000 caractères d'un favori navigateur dès que
 * l'origine Benchrs était longue (ex. préversion Vercel). Cette route
 * courte rend EXACTEMENT la même page, sans dupliquer la logique.
 *
 * La page d'origine (`/championship/bookmarklet/receive`) reste accessible
 * (lisibilité de l'URL, navigation manuelle, liens déjà partagés) : c'est
 * elle qui porte l'implémentation réelle, réexportée ici telle quelle.
 */
export { default } from "../../championship/bookmarklet/receive/page";
