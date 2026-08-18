/**
 * Wrapper lazy-loaded pour LineChart (recharts ~150KB gzip).
 * Utilise next/dynamic pour charger le composant côté client uniquement.
 * Les composants utilitaires légers sont réexportés directement.
 */

import dynamic from "next/dynamic";

// Composant principal — chargé en lazy
const LineChart = dynamic(
  () => import("recharts").then((m) => m.LineChart),
  { ssr: false }
);

// Composants utilitaires recharts — réexportés directement (légers)
export {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default LineChart;
