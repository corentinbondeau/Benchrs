/**
 * Wrapper lazy-loaded pour BarChart (recharts ~150KB gzip).
 * Utilise next/dynamic pour charger le composant côté client uniquement.
 * Les composants utilitaires légers sont réexportés directement.
 */

import dynamic from "next/dynamic";

// Composant principal — chargé en lazy
const BarChart = dynamic(
  () => import("recharts").then((m) => m.BarChart),
  { ssr: false }
);

// Composants utilitaires recharts — réexportés directement (légers)
export {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default BarChart;
