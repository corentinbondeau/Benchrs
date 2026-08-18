/**
 * Barrel export — wrappers recharts lazy-loaded via next/dynamic.
 *
 * Usage dans les composants :
 *   import LineChart, { Line, XAxis, ... } from "@/components/charts"
 *   import BarChart, { Bar, ... } from "@/components/charts"
 *   import RadarChart, { Radar, ... } from "@/components/charts"
 *
 * Les composants principaux (LineChart, BarChart, RadarChart) sont chargés
 * en lazy (ssr: false). Les utilitaires (XAxis, Tooltip, etc.) sont
 * réexportés directement depuis recharts.
 */

// Wrappers lazy — default exports
export { default as LineChart } from "./LineChart";
export { default as BarChart } from "./BarChart";
export { default as RadarChart } from "./RadarChart";

// Utilitaires communs — réexportés depuis recharts directement
export {
  // Axes & grille
  XAxis,
  YAxis,
  CartesianGrid,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  // Décorations
  Tooltip,
  Legend,
  // Conteneur
  ResponsiveContainer,
  // Séries
  Line,
  Bar,
  Radar,
  // Divers
  Cell,
} from "recharts";
