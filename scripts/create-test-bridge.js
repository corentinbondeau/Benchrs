#!/usr/bin/env node
/**
 * Script de setup pour les tests Vitest
 * Crée le bridge CJS dans node_modules/@/hooks/ pour permettre à
 * require("@/hooks/useDashboardData") de fonctionner dans les tests.
 * 
 * Ce fichier est exécuté par `npm run pretest`.
 *
 * Contexte : Le test use-dashboard-data-roles.test.tsx utilise require() CJS
 * avec l'alias @/ qui n'est pas résolvable par Node.js natif.
 * Ce bridge permet à Node.js de trouver le module et à Vitest de le transformer
 * via les mocks ESM.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const bridgeSrc = path.join(projectRoot, "src/hooks/useDashboardData-cjs-bridge.js");
const bridgeDstDir = path.join(projectRoot, "node_modules/@/hooks");
const bridgeDst = path.join(bridgeDstDir, "useDashboardData.js");
const pkgDst = path.join(projectRoot, "node_modules/@/package.json");

// Créer les répertoires nécessaires
if (!fs.existsSync(bridgeDstDir)) {
  fs.mkdirSync(bridgeDstDir, { recursive: true });
}

// Créer le package.json minimal pour le scope @
if (!fs.existsSync(pkgDst)) {
  fs.writeFileSync(pkgDst, '{}', 'utf8');
}

// Copier le bridge
if (fs.existsSync(bridgeSrc)) {
  fs.copyFileSync(bridgeSrc, bridgeDst);
  console.log('[test-bridge] ✓ Bridge créé dans node_modules/@/hooks/useDashboardData.js');
} else {
  console.warn('[test-bridge] ⚠ Source bridge non trouvée:', bridgeSrc);
}
