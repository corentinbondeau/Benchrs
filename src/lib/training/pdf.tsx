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
  Line,
  Polygon,
  G,
  Text as SvgText,
} from "@react-pdf/renderer";
import type { AISession, FicheSection, Schematic } from "./ai-generator";

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
