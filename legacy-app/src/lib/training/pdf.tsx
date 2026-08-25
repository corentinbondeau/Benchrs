import "server-only";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Svg,
  Rect,
  Circle,
  Ellipse,
  Line,
  Path,
  Polygon,
  G,
  Text as SvgText,
} from "@react-pdf/renderer";
import type { AISession, FicheSection, Schematic } from "./ai-generator";
import type { ExerciseSchematic, ExerciseSchematicElement } from "@/types";

const NAVY = "#102A43";
const ROYAL = "#2B6CB0";
const GOLD = "#F6C453";
const FIELD = "#E8F2E4";
const FIELD_LINE = "#334E68";
const ATTACK = "#C0392B";
const DEFENSE = "#2E86DE";

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1A202C",
  },
  header: {
    backgroundColor: NAVY,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },
  headerObjective: {
    color: "#D9E2EC",
    fontSize: 10,
    marginTop: 4,
  },
  headerMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  headerBadge: {
    backgroundColor: GOLD,
    color: NAVY,
    fontSize: 9,
    fontWeight: "bold",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginRight: 6,
    marginTop: 4,
  },
  headerBadgeLight: {
    backgroundColor: "rgba(255,255,255,0.18)",
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginRight: 6,
    marginTop: 4,
  },
  material: {
    backgroundColor: "#F0F4F8",
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  materialTitle: {
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 2,
  },
  section: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#CBD2D9",
    borderRadius: 8,
    overflow: "hidden",
  },
  sectionHeader: {
    backgroundColor: ROYAL,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionName: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 11,
  },
  sectionDuration: {
    color: "#FFFFFF",
    fontSize: 10,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  sectionBody: {
    padding: 10,
  },
  item: {
    marginBottom: 6,
  },
  itemLabel: {
    fontWeight: "bold",
    color: ROYAL,
    fontSize: 9.5,
  },
  itemText: {
    marginTop: 1,
    lineHeight: 1.4,
  },
  variantsTitle: {
    fontWeight: "bold",
    color: NAVY,
    marginTop: 6,
    marginBottom: 2,
  },
  variant: {
    flexDirection: "row",
    marginBottom: 1,
  },
  variantBullet: {
    width: 8,
  },
  variantText: {
    flex: 1,
    lineHeight: 1.4,
  },
  animationBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#9AE6B4",
    borderRadius: 6,
    backgroundColor: "#F0FFF4",
    padding: 8,
  },
  animationTitle: {
    fontWeight: "bold",
    color: "#276749",
    fontSize: 9.5,
    marginBottom: 2,
  },
  animationText: {
    fontSize: 9,
    color: "#22543D",
    lineHeight: 1.4,
  },
  schematicBox: {
    flexDirection: "row",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#CBD2D9",
    borderRadius: 6,
    overflow: "hidden",
  },
  schematicCanvas: {
    backgroundColor: "#FBFCFE",
  },
  schematicInfo: {
    flex: 1,
    padding: 8,
  },
  schematicLine: {
    fontSize: 8.5,
    color: "#334E68",
    marginBottom: 2,
  },
  schematicLabel: {
    fontSize: 9,
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 3,
  },
  tips: {
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 8,
    padding: 12,
    marginTop: 2,
  },
  tipsTitle: {
    fontWeight: "bold",
    color: NAVY,
    marginBottom: 6,
  },
  tip: {
    flexDirection: "row",
    marginBottom: 3,
  },
  tipNum: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: GOLD,
    color: NAVY,
    fontSize: 8,
    fontWeight: "bold",
    textAlign: "center",
    marginRight: 6,
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    lineHeight: 1.4,
  },
  footer: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 8,
    color: "#829AB1",
  },
});

function SchematicCanvas({ schematic }: { schematic: Schematic | null }) {
  const W = 300;
  const H = 190;
  const PITCH = { x: 34, y: 16, w: 232, h: 158 };
  const cx = PITCH.x + PITCH.w / 2;
  const cy = PITCH.y + PITCH.h / 2;

  function player(x: number, y: number, team: "att" | "def") {
    return <Circle key={`${x}-${y}`} cx={x} cy={y} r={6} fill={team === "att" ? ATTACK : DEFENSE} stroke={FIELD_LINE} strokeWidth={1} />;
  }

  function arrow(x1: number, y1: number, x2: number, y2: number, color: string) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 8;
    const hx = x2 - len * Math.cos(angle);
    const hy = y2 - len * Math.sin(angle);
    const dx1 = hx + len * 0.5 * Math.sin(angle);
    const dy1 = hy - len * 0.5 * Math.cos(angle);
    const dx2 = hx - len * 0.5 * Math.sin(angle);
    const dy2 = hy + len * 0.5 * Math.cos(angle);
    return (
      <G key={`${x1}-${y1}-${x2}-${y2}`}>
        <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} />
        <Polygon points={`${x2},${y2} ${dx1},${dy1} ${dx2},${dy2}`} fill={color} />
      </G>
    );
  }

  const type = schematic?.type || "pitch";

  let overlay: React.ReactNode = null;
  if (type === "zones") {
    overlay = (
      <G>
        <Rect x={48} y={30} width={52} height={52} stroke={ATTACK} strokeWidth={1.5} fill="rgba(192,57,43,0.08)" />
        <Rect x={110} y={30} width={52} height={52} stroke={ATTACK} strokeWidth={1.5} fill="rgba(192,57,43,0.08)" />
        <Rect x={48} y={96} width={52} height={52} stroke={DEFENSE} strokeWidth={1.5} fill="rgba(46,134,222,0.08)" />
        <Rect x={110} y={96} width={52} height={52} stroke={DEFENSE} strokeWidth={1.5} fill="rgba(46,134,222,0.08)" />
        <SvgText x={66} y={48} style={{ fontSize: 8, fill: ATTACK, textAnchor: "middle" }}>A</SvgText>
        <SvgText x={128} y={48} style={{ fontSize: 8, fill: ATTACK, textAnchor: "middle" }}>B</SvgText>
        <SvgText x={66} y={114} style={{ fontSize: 8, fill: DEFENSE, textAnchor: "middle" }}>C</SvgText>
        <SvgText x={128} y={114} style={{ fontSize: 8, fill: DEFENSE, textAnchor: "middle" }}>D</SvgText>
        {player(74, 60, "att")}
        {player(136, 60, "att")}
        {player(74, 126, "def")}
        {player(136, 126, "def")}
        {arrow(96, 86, 112, 86, ATTACK)}
      </G>
    );
  } else if (type === "grid") {
    overlay = (
      <G>
        {[0, 1, 2].map((col) => (
          <Line key={`v${col}`} x1={70 + col * 60} y1={40} x2={70 + col * 60} y2={150} stroke={ATTACK} strokeWidth={1.5} />
        ))}
        {[0, 1].map((row) => (
          <Line key={`h${row}`} x1={70} y1={40 + row * 55} x2={190} y2={40 + row * 55} stroke={ATTACK} strokeWidth={1.5} />
        ))}
        {[85, 145].map((x) => [55, 110].map((y) => player(x, y, "att")))}
        <SvgText x={130} y={34} style={{ fontSize: 8, fill: FIELD_LINE, textAnchor: "middle" }}>4 ateliers</SvgText>
      </G>
    );
  } else if (type === "circle") {
    overlay = (
      <G>
        <Circle cx={cx} cy={cy} r={34} stroke={ATTACK} strokeWidth={2} fill="rgba(192,57,43,0.06)" />
        <Circle cx={cx} cy={cy} r={5} fill={FIELD_LINE} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return player(cx + 34 * Math.cos(rad), cy + 34 * Math.sin(rad), deg % 180 === 0 ? "att" : "def");
        })}
        {arrow(cx, cy - 34, cx, cy + 34, ATTACK)}
      </G>
    );
  } else if (type === "corridor") {
    overlay = (
      <G>
        <Rect x={PITCH.x} y={PITCH.y} width={56} height={PITCH.h} fill="rgba(246,196,83,0.22)" stroke={GOLD} strokeWidth={1.5} />
        <SvgText x={PITCH.x + 28} y={28} style={{ fontSize: 7.5, fill: "#8A6D1A", textAnchor: "middle" }}>COULOIR</SvgText>
        {player(PITCH.x + 28, 60, "def")}
        {player(PITCH.x + 28, 90, "def")}
        {player(cx, cy, "att")}
        {player(cx + 70, cy, "att")}
        {arrow(PITCH.x + 28, 60, cx - 10, 70, ATTACK)}
        {arrow(cx, cy, cx + 70, cy, ATTACK)}
      </G>
    );
  } else if (type === "line") {
    overlay = (
      <G>
        <Line x1={70} y1={cy} x2={230} y2={cy} stroke={ATTACK} strokeWidth={2} />
        {[78, 108, 138, 168, 198, 228].map((x, i) => player(x, cy + (i % 2 === 0 ? 18 : -18), i % 2 === 0 ? "att" : "def"))}
        {arrow(108, cy + 18, 138, cy - 18, ATTACK)}
      </G>
    );
  }

  return (
    <View style={styles.schematicCanvas}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Rect x={PITCH.x} y={PITCH.y} width={PITCH.w} height={PITCH.h} stroke={FIELD_LINE} strokeWidth={2} fill={FIELD} />
        <Line x1={cx} y1={PITCH.y} x2={cx} y2={PITCH.y + PITCH.h} stroke={FIELD_LINE} strokeWidth={1.5} />
        <Circle cx={cx} cy={cy} r={22} stroke={FIELD_LINE} strokeWidth={1.5} fill="none" />
        <Rect x={PITCH.x} y={cy - 34} width={34} height={68} stroke={FIELD_LINE} strokeWidth={1.5} fill="none" />
        <Rect x={PITCH.x + PITCH.w - 34} y={cy - 34} width={34} height={68} stroke={FIELD_LINE} strokeWidth={1.5} fill="none" />
        <Rect x={PITCH.x - 9} y={cy - 11} width={11} height={22} fill="#FFFFFF" stroke={FIELD_LINE} strokeWidth={1.5} />
        <Rect x={PITCH.x + PITCH.w - 2} y={cy - 11} width={11} height={22} fill="#FFFFFF" stroke={FIELD_LINE} strokeWidth={1.5} />
        {overlay}
        {(type === "pitch" || type === "zones") && (
          <G>
            {player(cx - 60, cy - 25, "att")}
            {player(cx - 25, cy - 30, "att")}
            {player(cx + 55, cy + 30, "def")}
            {player(cx + 25, cy + 30, "def")}
          </G>
        )}
        {(type === "pitch") && arrow(cx - 40, cy - 15, cx + 20, cy + 15, ATTACK)}
      </Svg>
    </View>
  );
}

function SectionBlock({ section }: { section: FicheSection }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionName}>{section.name}</Text>
        <Text style={styles.sectionDuration}>{section.duration} min</Text>
      </View>
      <View style={styles.sectionBody}>
        {section.items.map((item, i) => (
          <View key={i} style={styles.item}>
            {item.label ? <Text style={styles.itemLabel}>{item.label}</Text> : null}
            <Text style={styles.itemText}>{item.text}</Text>
          </View>
        ))}
        {section.variants.length > 0 && (
          <View>
            <Text style={styles.variantsTitle}>Variantes / Progression</Text>
            {section.variants.map((v, i) => (
              <View key={i} style={styles.variant}>
                <Text style={styles.variantBullet}>•</Text>
                <Text style={styles.variantText}>{v}</Text>
              </View>
            ))}
          </View>
        )}
        {section.schematic && (
          <View style={styles.schematicBox}>
            <SchematicCanvas schematic={section.schematic} />
            <View style={styles.schematicInfo}>
              <Text style={styles.schematicLabel}>Schéma du dispositif</Text>
              {section.schematic.dimensions ? <Text style={styles.schematicLine}>Dimensions : {section.schematic.dimensions}</Text> : null}
              {section.schematic.players ? <Text style={styles.schematicLine}>Effectif : {section.schematic.players}</Text> : null}
              {section.schematic.description ? <Text style={styles.schematicLine}>{section.schematic.description}</Text> : null}
            </View>
          </View>
        )}
        {section.animation ? (
          <View style={styles.animationBox}>
            <Text style={styles.animationTitle}>Animation simple (déroulé étape par étape)</Text>
            <Text style={styles.animationText}>{section.animation}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SessionFiche({ session }: { session: AISession }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{session.title}</Text>
          <Text style={styles.headerObjective}>{session.objective}</Text>
          <View style={styles.headerMeta}>
            {session.phase ? <Text style={styles.headerBadgeLight}>{session.phase}</Text> : null}
            <Text style={styles.headerBadge}>Durée : 90 min</Text>
            <Text style={styles.headerBadgeLight}>Séance complète</Text>
          </View>
        </View>

        {session.material ? (
          <View style={styles.material}>
            <Text style={styles.materialTitle}>Matériel nécessaire</Text>
            <Text>{session.material}</Text>
          </View>
        ) : null}

        {session.sections.map((section, i) => (
          <SectionBlock key={i} section={section} />
        ))}

        {session.conseilsCoach.length > 0 && (
          <View style={styles.tips}>
            <Text style={styles.tipsTitle}>Conseils du coach (Méthodologie UEFA B)</Text>
            {session.conseilsCoach.map((tip, i) => (
              <View key={i} style={styles.tip}>
                <Text style={styles.tipNum}>{i + 1}</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Généré par Benchrs — Fiche de séance (90 min)</Text>
      </Page>
    </Document>
  );
}

export async function renderSessionPdf(session: AISession): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const node = React.createElement(
    SessionFiche,
    { session }
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(node);
}

export interface ManualSession {
  title: string;
  objectives?: string[] | null;
  notes?: string | null;
  exercises: {
    name: string;
    duration: number;
    description: string;
    drill_type: string;
    schema?: ExerciseSchematic | null;
  }[];
}

const manualStyles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1A202C",
  },
  header: {
    backgroundColor: NAVY,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },
  headerObjective: {
    color: "#D9E2EC",
    fontSize: 10,
    marginTop: 4,
  },
  headerMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 6,
  },
  headerBadge: {
    backgroundColor: GOLD,
    color: NAVY,
    fontSize: 9,
    fontWeight: "bold",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  exercise: {
    borderWidth: 1,
    borderColor: "#D9E2EC",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  exerciseName: {
    fontSize: 11,
    fontWeight: "bold",
    color: NAVY,
    flex: 1,
  },
  exerciseDuration: {
    fontSize: 10,
    fontWeight: "bold",
    color: ROYAL,
    marginLeft: 8,
  },
  exerciseType: {
    alignSelf: "flex-start",
    backgroundColor: "#EBF0F5",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8,
    color: "#486581",
    marginBottom: 6,
  },
  description: {
    fontSize: 9,
    color: "#486581",
  },
  schematicBox: {
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#CBD2D9",
    borderRadius: 6,
    padding: 6,
  },
  footer: {
    textAlign: "center",
    color: "#9FB3C8",
    fontSize: 8,
    marginTop: 12,
  },
});

const EX_TEAM_COLORS: Record<NonNullable<ExerciseSchematicElement["team"]>, string> = {
  att: ATTACK,
  def: DEFENSE,
  neutral: "#FFFFFF",
  yellow: "#F4D03F",
  green: "#27AE60",
  orange: "#E67E22",
  purple: "#8E44AD",
  black: "#2C3E50",
};

const EX_LIGHT_TEAMS: NonNullable<ExerciseSchematicElement["team"]>[] = ["neutral", "yellow", "orange"];

const EX_VIEW_DIMS: Record<NonNullable<ExerciseSchematic["view"]>, { w: number; h: number }> = {
  full: { w: 300, h: 450 },
  half: { w: 300, h: 450 },
  third: { w: 300, h: 450 },
  h_full: { w: 450, h: 300 },
  h_half: { w: 450, h: 300 },
};

function exArrowHead(x: number, y: number, angle: number, size = 9, color = GOLD) {
  const hx = x - size * Math.cos(angle);
  const hy = y - size * Math.sin(angle);
  const dx1 = hx + size * 0.5 * Math.sin(angle);
  const dy1 = hy - size * 0.5 * Math.cos(angle);
  const dx2 = hx - size * 0.5 * Math.sin(angle);
  const dy2 = hy + size * 0.5 * Math.cos(angle);
  return <Polygon points={`${x},${y} ${dx1},${dy1} ${dx2},${dy2}`} fill={color} />;
}

function exArrowControl(el: ExerciseSchematicElement) {
  const x1 = el.x;
  const y1 = el.y;
  const x2 = el.x2 ?? el.x;
  const y2 = el.y2 ?? el.y;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const off = 36;
  return { x: mx - ((y2 - y1) / len) * off, y: my + ((x2 - x1) / len) * off };
}

function ExPitchMarkings({ view }: { view: NonNullable<ExerciseSchematic["view"]> }) {
  const s = "rgba(255,255,255,0.55)";
  const g = { stroke: s, fill: "none", strokeWidth: 2 };
  if (view === "half") {
    return (
      <G {...g}>
        <Rect x={8} y={8} width={284} height={434} rx={2} />
        <Line x1={8} y1={225} x2={292} y2={225} strokeWidth={1.5} />
        <Path d="M 100 225 A 50 50 0 0 1 200 225" strokeWidth={1.5} />
        <Circle cx={150} cy={225} r={3} fill="rgba(255,255,255,0.7)" />
        <Rect x={75} y={362} width={150} height={80} strokeWidth={1.5} />
        <Rect x={105} y={407} width={90} height={35} strokeWidth={1.5} />
        <Circle cx={150} cy={395} r={3} fill="rgba(255,255,255,0.7)" />
        <Path d="M 115 362 Q 150 378 185 362" strokeWidth={1.5} />
        <Rect x={120} y={442} width={60} height={8} strokeWidth={2} />
      </G>
    );
  }
  if (view === "third") {
    return (
      <G {...g}>
        <Rect x={8} y={8} width={284} height={434} rx={2} />
        <Line x1={8} y1={300} x2={292} y2={300} strokeWidth={1.5} />
        <Rect x={75} y={342} width={150} height={80} strokeWidth={1.5} />
        <Rect x={105} y={387} width={90} height={35} strokeWidth={1.5} />
        <Circle cx={150} cy={375} r={3} fill="rgba(255,255,255,0.7)" />
        <Path d="M 115 342 Q 150 358 185 342" strokeWidth={1.5} />
        <Rect x={120} y={422} width={60} height={8} strokeWidth={2} />
      </G>
    );
  }
  if (view === "h_full") {
    return (
      <G {...g}>
        <Rect x={8} y={8} width={434} height={284} rx={2} />
        <Line x1={225} y1={8} x2={225} y2={292} strokeWidth={1.5} />
        <Circle cx={225} cy={150} r={50} strokeWidth={1.5} />
        <Circle cx={225} cy={150} r={3} fill="rgba(255,255,255,0.7)" />
        <Rect x={8} y={75} width={80} height={150} strokeWidth={1.5} />
        <Rect x={8} y={105} width={35} height={90} strokeWidth={1.5} />
        <Circle cx={60} cy={150} r={3} fill="rgba(255,255,255,0.7)" />
        <Path d="M 88 115 Q 104 150 88 185" strokeWidth={1.5} />
        <Rect x={0} y={120} width={8} height={60} strokeWidth={2} />
        <Rect x={362} y={75} width={80} height={150} strokeWidth={1.5} />
        <Rect x={407} y={105} width={35} height={90} strokeWidth={1.5} />
        <Circle cx={390} cy={150} r={3} fill="rgba(255,255,255,0.7)" />
        <Path d="M 362 115 Q 346 150 362 185" strokeWidth={1.5} />
        <Rect x={442} y={120} width={8} height={60} strokeWidth={2} />
      </G>
    );
  }
  if (view === "h_half") {
    return (
      <G {...g}>
        <Rect x={8} y={8} width={434} height={284} rx={2} />
        <Line x1={225} y1={8} x2={225} y2={292} strokeWidth={1.5} />
        <Path d="M 225 100 A 50 50 0 0 1 225 200" strokeWidth={1.5} />
        <Circle cx={225} cy={150} r={3} fill="rgba(255,255,255,0.7)" />
        <Rect x={362} y={75} width={80} height={150} strokeWidth={1.5} />
        <Rect x={407} y={105} width={35} height={90} strokeWidth={1.5} />
        <Circle cx={390} cy={150} r={3} fill="rgba(255,255,255,0.7)" />
        <Path d="M 362 115 Q 346 150 362 185" strokeWidth={1.5} />
        <Rect x={442} y={120} width={8} height={60} strokeWidth={2} />
      </G>
    );
  }
  return (
    <G {...g}>
      <Rect x={8} y={8} width={284} height={434} rx={2} />
      <Line x1={8} y1={225} x2={292} y2={225} strokeWidth={1.5} />
      <Circle cx={150} cy={225} r={50} strokeWidth={1.5} />
      <Circle cx={150} cy={225} r={3} fill="rgba(255,255,255,0.7)" />
      <Rect x={75} y={8} width={150} height={80} strokeWidth={1.5} />
      <Rect x={105} y={8} width={90} height={35} strokeWidth={1.5} />
      <Circle cx={150} cy={55} r={3} fill="rgba(255,255,255,0.7)" />
      <Rect x={120} y={0} width={60} height={8} strokeWidth={2} />
      <Rect x={75} y={362} width={150} height={80} strokeWidth={1.5} />
      <Rect x={105} y={407} width={90} height={35} strokeWidth={1.5} />
      <Circle cx={150} cy={395} r={3} fill="rgba(255,255,255,0.7)" />
      <Rect x={120} y={442} width={60} height={8} strokeWidth={2} />
    </G>
  );
}

function ExerciseSchematicSvg({ schema }: { schema: ExerciseSchematic }) {
  function renderEl(el: ExerciseSchematicElement) {
    if (el.type === "player") {
      const team = el.team || "att";
      const color = EX_TEAM_COLORS[team];
      const dark = EX_LIGHT_TEAMS.includes(team);
      return (
        <G key={el.id}>
          <Circle cx={el.x} cy={el.y} r={10} fill={color} stroke="#FFFFFF" strokeWidth={1.5} />
          {el.number ? (
            <SvgText x={el.x} y={el.y + 3.5} style={{ fontSize: 9, fontWeight: "bold", fill: dark ? "#1F2937" : "#FFFFFF", textAnchor: "middle" }}>
              {el.number}
            </SvgText>
          ) : null}
        </G>
      );
    }
    if (el.type === "cone") {
      return (
        <Polygon
          key={el.id}
          points={`${el.x},${el.y - 9} ${el.x - 6},${el.y + 7} ${el.x + 6},${el.y + 7}`}
          fill={el.color || "#F97316"}
          stroke="#FFFFFF"
          strokeWidth={1}
        />
      );
    }
    if (el.type === "ball") {
      return (
        <G key={el.id}>
          {el.ballVariant === "motion" && (
            <G stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} fill="none">
              <Path d={`M ${el.x + 7} ${el.y - 5} q 4 3 0 6`} />
              <Path d={`M ${el.x + 10.5} ${el.y - 1} q 4 3 0 6`} />
            </G>
          )}
          <Circle cx={el.x} cy={el.y} r={4.5} fill="#FFFFFF" stroke="#111111" strokeWidth={1} />
        </G>
      );
    }
    if (el.type === "arrow") {
      const x1 = el.x;
      const y1 = el.y;
      const x2 = el.x2 ?? el.x;
      const y2 = el.y2 ?? el.y;
      const variant = el.arrowVariant || "solid";
      let startAngle: number | null = null;
      let endAngle: number | null = null;
      let body: React.ReactElement;
      if (variant === "curved") {
        const c = exArrowControl(el);
        body = <Path d={`M ${x1} ${y1} Q ${c.x} ${c.y} ${x2} ${y2}`} stroke={GOLD} strokeWidth={2.5} fill="none" />;
        startAngle = Math.atan2(y1 - c.y, x1 - c.x);
        endAngle = Math.atan2(y2 - c.y, x2 - c.x);
      } else {
        body = (
          <Line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={GOLD}
            strokeWidth={2.5}
            strokeDasharray={variant === "dashed" ? "6 4" : undefined}
          />
        );
        const ang = Math.atan2(y2 - y1, x2 - x1);
        startAngle = ang + Math.PI;
        endAngle = ang;
      }
      return (
        <G key={el.id}>
          {body}
          {endAngle !== null && exArrowHead(x2, y2, endAngle, 9)}
          {variant === "double" && startAngle !== null && exArrowHead(x1, y1, startAngle, 9)}
        </G>
      );
    }
    if (el.type === "zone") {
      const x = Math.min(el.x, el.x2 ?? el.x);
      const y = Math.min(el.y, el.y2 ?? el.y);
      const w = Math.abs((el.x2 ?? el.x) - el.x);
      const h = Math.abs((el.y2 ?? el.y) - el.y);
      return (
        <G key={el.id}>
          <Rect x={x} y={y} width={w} height={h} fill="rgba(255,255,255,0.25)" stroke={GOLD} strokeWidth={1.5} />
          {el.text ? (
            <SvgText x={x + w / 2} y={y + h / 2} style={{ fontSize: 9, fill: "#FFFFFF", textAnchor: "middle" }}>
              {el.text}
            </SvgText>
          ) : null}
        </G>
      );
    }
    if (el.type === "shape") {
      const x = Math.min(el.x, el.x2 ?? el.x);
      const y = Math.min(el.y, el.y2 ?? el.y);
      const w = Math.max(1, Math.abs((el.x2 ?? el.x) - el.x));
      const h = Math.max(1, Math.abs((el.y2 ?? el.y) - el.y));
      const cx = x + w / 2;
      const cy = y + h / 2;
      const color = el.color || GOLD;
      const kind = el.shapeKind || "rect";
      const strokeProps = { fill: color + "3D", stroke: color, strokeWidth: 1.5 };
      let shape: React.ReactElement;
      if (kind === "circle") {
        shape = <Ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...strokeProps} />;
      } else if (kind === "triangle") {
        shape = <Polygon points={`${cx},${y} ${x + w},${y + h} ${x},${y + h}`} {...strokeProps} />;
      } else if (kind === "diamond") {
        shape = <Polygon points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} {...strokeProps} />;
      } else if (kind === "hexagon") {
        const pts: string[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          pts.push(`${(cx + (w / 2) * Math.cos(a)).toFixed(1)},${(cy + (h / 2) * Math.sin(a)).toFixed(1)}`);
        }
        shape = <Polygon points={pts.join(" ")} {...strokeProps} />;
      } else {
        shape = <Rect x={x} y={y} width={w} height={h} rx={2} {...strokeProps} />;
      }
      return (
        <G key={el.id}>
          {shape}
          {el.text ? (
            <SvgText x={cx} y={cy + 3.5} style={{ fontSize: 9, fill: "#FFFFFF", textAnchor: "middle" }}>
              {el.text}
            </SvgText>
          ) : null}
        </G>
      );
    }
    return (
      <SvgText
        key={el.id}
        x={el.x}
        y={el.y + 4}
        style={{ fontSize: 11, fontWeight: "bold", fill: "#FFFFFF", textAnchor: "middle" }}
      >
        {el.text || "Texte"}
      </SvgText>
    );
  }

  const view = schema.view || "full";
  const dims = EX_VIEW_DIMS[view];
  const pdfW = dims.w > dims.h ? 195 : 150;
  const pdfH = (pdfW * dims.h) / dims.w;
  return (
    <Svg width={pdfW} height={pdfH} viewBox={`0 0 ${dims.w} ${dims.h}`}>
      <Rect x={0} y={0} width={dims.w} height={dims.h} fill="#1B7A3D" />
      <ExPitchMarkings view={view} />
      {(schema.elements || []).map((el) => renderEl(el))}
    </Svg>
  );
}

function ManualSessionFiche({ session }: { session: ManualSession }) {
  const total = session.exercises.reduce((sum, e) => sum + (e.duration || 0), 0);
  return (
    <Document>
      <Page size="A4" style={manualStyles.page}>
        <View style={manualStyles.header}>
          <Text style={manualStyles.headerTitle}>{session.title || "Séance"}</Text>
          {session.objectives && session.objectives.length > 0 && (
            <Text style={manualStyles.headerObjective}>{session.objectives.join(" · ")}</Text>
          )}
          <View style={manualStyles.headerMeta}>
            <Text style={manualStyles.headerBadge}>Exercices : {session.exercises.length}</Text>
            <Text style={manualStyles.headerBadge}>Durée totale : {total} min</Text>
          </View>
        </View>

        {session.exercises.map((ex, i) => (
          <View key={i} style={manualStyles.exercise}>
            <View style={manualStyles.exerciseHeader}>
              <Text style={manualStyles.exerciseName}>
                {i + 1}. {ex.name || "Exercice"}
              </Text>
              {ex.duration > 0 && (
                <Text style={manualStyles.exerciseDuration}>{ex.duration} min</Text>
              )}
            </View>
            {ex.drill_type ? (
              <Text style={manualStyles.exerciseType}>{ex.drill_type}</Text>
            ) : null}
            {ex.description ? (
              <Text style={manualStyles.description}>{ex.description}</Text>
            ) : null}
            {ex.schema && ex.schema.elements && ex.schema.elements.length > 0 ? (
              <View style={manualStyles.schematicBox}>
                <ExerciseSchematicSvg schema={ex.schema} />
              </View>
            ) : null}
          </View>
        ))}

        {session.notes ? (
          <Text style={manualStyles.description}>{session.notes}</Text>
        ) : null}

        <Text style={manualStyles.footer}>Généré par Benchrs — Fiche de séance</Text>
      </Page>
    </Document>
  );
}

export async function renderManualSessionPdf(session: ManualSession): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const node = React.createElement(
    ManualSessionFiche,
    { session }
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(node);
}
