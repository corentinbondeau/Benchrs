/**
 * Wrapper lazy-loaded pour RadarChart (recharts ~150KB gzip).
 * Utilise next/dynamic pour charger le composant côté client uniquement.
 * Les composants utilitaires légers sont réexportés directement.
 */

import dynamic from "next/dynamic";

// Composant principal — chargé en lazy
const RadarChart = dynamic(
  () => import("recharts").then((m) => m.RadarChart),
  { ssr: false }
);

// Composants utilitaires recharts — réexportés directement (légers)
export {
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default RadarChart;
