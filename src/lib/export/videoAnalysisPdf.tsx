import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { VideoAnalysis, VideoAnalysisResult } from "@/lib/videoAnalysis";
import { formatVideoDuration, formatVideoTime, normalizeVideoAnalysis } from "@/lib/videoAnalysis";

// ── Palette ──────────────────────────────────────────────────────────────────
const NAVY = "#102A43";
const GOLD = "#F6C453";
const MUTED = "#718096";
const BORDER = "#E2E8F0";
const BG_LIGHT = "#F7FAFC";
const BG_MUTED = "#EBF0F5";

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1A202C",
    backgroundColor: "#FFFFFF",
  },

  // En-tête
  header: {
    backgroundColor: NAVY,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  headerSub: {
    color: "#D9E2EC",
    fontSize: 9,
    marginTop: 4,
  },
  headerBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 6,
  },
  badge: {
    backgroundColor: GOLD,
    color: NAVY,
    fontSize: 8,
    fontWeight: "bold",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginRight: 6,
  },
  badgeLight: {
    backgroundColor: "rgba(255,255,255,0.18)",
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "bold",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginRight: 6,
  },

  // Titres de section
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: NAVY,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 4,
    marginBottom: 8,
    marginTop: 14,
  },

  // ── Possession ──
  possessionBarWrapper: {
    flexDirection: "row",
    height: 20,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 6,
  },
  possessionSegment: {
    alignItems: "center",
    justifyContent: "center",
  },
  possessionLabel: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  possessionLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 8,
    color: MUTED,
  },

  // ── Stats clés (tableau 2 colonnes) ──
  statsTableHeader: {
    flexDirection: "row",
    backgroundColor: BG_MUTED,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  statsRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  statsRowAlt: {
    backgroundColor: BG_LIGHT,
  },
  colLabel: {
    flex: 1.5,
    fontSize: 8.5,
    color: "#4A5568",
  },
  colValue: {
    width: 70,
    textAlign: "right",
    fontSize: 9,
    fontWeight: "bold",
  },
  colValueHeader: {
    width: 70,
    textAlign: "right",
    fontSize: 8,
    fontWeight: "bold",
    color: "#4A5568",
  },

  // ── Métriques physiques / structure ──
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  metricCard: {
    backgroundColor: BG_MUTED,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 90,
    flex: 1,
  },
  metricHeader: {
    fontSize: 7.5,
    color: MUTED,
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 9,
    fontWeight: "bold",
  },
  subSectionTitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: NAVY,
    marginTop: 8,
    marginBottom: 4,
  },

  // ── Timeline ──
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    gap: 8,
  },
  timelineBadge: {
    width: 40,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineTime: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  timelineType: {
    fontSize: 8.5,
    fontWeight: "bold",
    flex: 1,
  },
  timelineNote: {
    fontSize: 8,
    color: MUTED,
    flex: 2,
  },
  timelineTeam: {
    fontSize: 7.5,
    color: MUTED,
    width: 55,
    textAlign: "right",
  },
  emptyMsg: {
    fontSize: 8.5,
    color: MUTED,
    marginVertical: 6,
  },

  // ── Métadonnées ──
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
  },
  metaChip: {
    backgroundColor: BG_MUTED,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginRight: 6,
  },
  metaText: {
    fontSize: 7.5,
    color: MUTED,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 28,
    right: 28,
    textAlign: "center",
    fontSize: 7.5,
    color: "#A0AEC0",
  },
});

// ── Composant principal ───────────────────────────────────────────────────────
export function VideoAnalysisPdf({ analysis }: { analysis: VideoAnalysis }) {
  // Normalisation identique au dashboard (result peut être partiel)
  const result = analysis.result as Partial<VideoAnalysisResult> | null;

  const possession = result?.stats?.possession ?? { team1: 0, team2: 0, measured_sec: 0 };
  const passes = result?.stats?.passes ?? { team1: 0, team2: 0 };
  const shots = result?.stats?.shots ?? { team1: 0, team2: 0 };
  const shotsOnTarget = result?.stats?.shots_on_target ?? { team1: 0, team2: 0 };
  const physical = result?.stats?.physical;
  const structure = result?.stats?.structure;
  const pressure = result?.stats?.pressure;
  const timeline = Array.isArray(result?.timeline) ? result!.timeline : [];
  const meta = result?.meta;
  const t1 = result?.teams?.team1 ?? { label: "Équipe 1", color: "#3b82f6" };
  const t2 = result?.teams?.team2 ?? { label: "Équipe 2", color: "#ef4444" };

  const exportedAt = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── En-tête ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{analysis.title || "Analyse vidéo"}</Text>
          <Text style={styles.headerSub}>
            Rapport d&apos;analyse — exporté le {exportedAt}
          </Text>
          <View style={styles.headerBadgeRow}>
            <Text style={styles.badge}>Benchrs</Text>
            <Text style={styles.badgeLight}>
              {t1.label}  vs  {t2.label}
            </Text>
            {analysis.model_version && (
              <Text style={styles.badgeLight}>{analysis.model_version}</Text>
            )}
          </View>
        </View>

        {/* ── Possession ── */}
        <Text style={styles.sectionTitle}>Possession de balle</Text>
        <View style={styles.possessionBarWrapper}>
          {possession.team1 > 0 && (
            <View
              style={[
                styles.possessionSegment,
                { width: `${possession.team1}%`, backgroundColor: t1.color },
              ]}
            >
              {possession.team1 > 10 && (
                <Text style={styles.possessionLabel}>{possession.team1}%</Text>
              )}
            </View>
          )}
          {possession.team2 > 0 && (
            <View
              style={[
                styles.possessionSegment,
                { width: `${possession.team2}%`, backgroundColor: t2.color },
              ]}
            >
              {possession.team2 > 10 && (
                <Text style={styles.possessionLabel}>{possession.team2}%</Text>
              )}
            </View>
          )}
        </View>
        <View style={styles.possessionLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: t1.color }]} />
            <Text style={styles.legendText}>
              {t1.label} — {possession.team1}%
            </Text>
          </View>
          <Text style={styles.legendText}>
            {formatVideoDuration(possession.measured_sec)} mesurés
          </Text>
          <View style={styles.legendItem}>
            <Text style={styles.legendText}>
              {t2.label} — {possession.team2}%{" "}
            </Text>
            <View style={[styles.legendDot, { backgroundColor: t2.color }]} />
          </View>
        </View>

        {/* ── Stats clés ── */}
        <Text style={styles.sectionTitle}>Stats clés</Text>
        <View style={styles.statsTableHeader}>
          <Text style={styles.colLabel}>Statistique</Text>
          <Text style={[styles.colValueHeader, { color: t1.color }]}>{t1.label}</Text>
          <Text style={[styles.colValueHeader, { color: t2.color }]}>{t2.label}</Text>
        </View>
        {(
          [
            { label: "Passes", v1: passes.team1, v2: passes.team2 },
            { label: "Tirs", v1: shots.team1, v2: shots.team2 },
            { label: "Tirs cadrés", v1: shotsOnTarget.team1, v2: shotsOnTarget.team2 },
          ] as const
        ).map((row, i) => (
          <View key={row.label} style={[styles.statsRow, i % 2 === 1 ? styles.statsRowAlt : {}]}>
            <Text style={styles.colLabel}>{row.label}</Text>
            <Text style={[styles.colValue, { color: t1.color }]}>{row.v1}</Text>
            <Text style={[styles.colValue, { color: t2.color }]}>{row.v2}</Text>
          </View>
        ))}

        {/* ── Métriques physiques ── */}
        {physical && (
          <>
            <Text style={styles.sectionTitle}>Physique &amp; structure</Text>
            <Text style={styles.subSectionTitle}>Physique</Text>
            <View style={styles.metricsGrid}>
              {(
                [
                  {
                    label: "Distance",
                    v1: `${physical.team1.distance_km.toFixed(2)} km`,
                    v2: `${physical.team2.distance_km.toFixed(2)} km`,
                  },
                  {
                    label: "Haute intensité",
                    v1: `${physical.team1.high_intensity_km.toFixed(2)} km`,
                    v2: `${physical.team2.high_intensity_km.toFixed(2)} km`,
                  },
                  {
                    label: "Vitesse moy.",
                    v1: `${physical.team1.speed_avg_kmh.toFixed(1)} km/h`,
                    v2: `${physical.team2.speed_avg_kmh.toFixed(1)} km/h`,
                  },
                  {
                    label: "Vitesse max",
                    v1: `${physical.team1.speed_max_kmh.toFixed(1)} km/h`,
                    v2: `${physical.team2.speed_max_kmh.toFixed(1)} km/h`,
                  },
                ] as const
              ).map((m) => (
                <View key={m.label} style={styles.metricCard}>
                  <Text style={styles.metricHeader}>{m.label}</Text>
                  <Text style={[styles.metricValue, { color: t1.color }]}>{m.v1}</Text>
                  <Text style={[styles.metricValue, { color: t2.color }]}>{m.v2}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Structure du bloc ── */}
        {structure && (
          <>
            {!physical && <Text style={styles.sectionTitle}>Physique &amp; structure</Text>}
            <Text style={styles.subSectionTitle}>Structure du bloc</Text>
            <View style={styles.metricsGrid}>
              {(
                [
                  {
                    label: "Profondeur",
                    v1: `${structure.team1.depth_m.toFixed(1)} m`,
                    v2: `${structure.team2.depth_m.toFixed(1)} m`,
                  },
                  {
                    label: "Largeur",
                    v1: `${structure.team1.width_m.toFixed(1)} m`,
                    v2: `${structure.team2.width_m.toFixed(1)} m`,
                  },
                  {
                    label: "Compacité",
                    v1: `${structure.team1.compactness_m.toFixed(1)} m`,
                    v2: `${structure.team2.compactness_m.toFixed(1)} m`,
                  },
                  {
                    label: "Joueurs visibles",
                    v1: `${structure.team1.players_visible_avg.toFixed(1)}`,
                    v2: `${structure.team2.players_visible_avg.toFixed(1)}`,
                  },
                ] as const
              ).map((m) => (
                <View key={m.label} style={styles.metricCard}>
                  <Text style={styles.metricHeader}>{m.label}</Text>
                  <Text style={[styles.metricValue, { color: t1.color }]}>{m.v1}</Text>
                  <Text style={[styles.metricValue, { color: t2.color }]}>{m.v2}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Pression ── */}
        {pressure && (
          <>
            <Text style={styles.subSectionTitle}>Pression (distance au ballon)</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricHeader}>Dist. moy.</Text>
                <Text style={[styles.metricValue, { color: t1.color }]}>
                  {pressure.team1.avg_dist_m.toFixed(1)} m
                </Text>
                <Text style={[styles.metricValue, { color: t2.color }]}>
                  {pressure.team2.avg_dist_m.toFixed(1)} m
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricHeader}>Sur le ballon</Text>
                <Text style={[styles.metricValue, { color: t1.color }]}>
                  {pressure.team1.near_ball_avg.toFixed(1)}
                </Text>
                <Text style={[styles.metricValue, { color: t2.color }]}>
                  {pressure.team2.near_ball_avg.toFixed(1)}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* ── Timeline ── */}
        <Text style={styles.sectionTitle}>Temps forts</Text>
        {timeline.length === 0 ? (
          <Text style={styles.emptyMsg}>Aucun tir détecté sur cette vidéo.</Text>
        ) : (
          <>
            {timeline.map((evt, i) => {
              const team = evt.team === "team1" ? t1 : t2;
              const typeLabel = evt.type === "goal" ? "But probable" : "Tir";
              const onTargetSuffix = evt.on_target ? " · Cadré" : "";
              return (
                <View key={i} style={styles.timelineRow}>
                  <View
                    style={[styles.timelineBadge, { backgroundColor: team.color }]}
                  >
                    <Text style={styles.timelineTime}>
                      {formatVideoTime(evt.t ?? 0)}
                    </Text>
                  </View>
                  <Text style={[styles.timelineType, { color: team.color }]}>
                    {typeLabel}{onTargetSuffix}
                  </Text>
                  <Text style={styles.timelineNote}>{evt.note}</Text>
                  <Text style={styles.timelineTeam}>{team.label}</Text>
                </View>
              );
            })}
          </>
        )}

        {/* ── Métadonnées ── */}
        <View style={styles.metaRow}>
          {meta?.duration_sec && meta.duration_sec > 0 && (
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>
                Durée : {formatVideoDuration(meta.duration_sec)}
              </Text>
            </View>
          )}
          {meta?.width && meta?.height && (
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>
                Résolution : {meta.width}×{meta.height}
              </Text>
            </View>
          )}
          {meta?.fps && (
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>{meta.fps} fps</Text>
            </View>
          )}
          {analysis.model_version && (
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>Modèle : {analysis.model_version}</Text>
            </View>
          )}
          {meta?.timed_out && (
            <View style={[styles.metaChip, { backgroundColor: "#FFF5F5" }]}>
              <Text style={[styles.metaText, { color: "#C53030" }]}>
                Analyse interrompue (timeout)
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.footer}>
          Généré par Benchrs — Rapport d&apos;analyse vidéo
        </Text>
      </Page>
    </Document>
  );
}

// ── Rendu serveur (Node / API route) ─────────────────────────────────────────
// Utilise renderToBuffer de @react-pdf/renderer, disponible uniquement dans un
// environnement Node.js (pas dans le browser). L'import dynamique évite que le
// module soit bundlé côté client.
export async function renderVideoAnalysisPdf(
  analysis: VideoAnalysis
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const normalized = normalizeVideoAnalysis(analysis);
  const node = React.createElement(
    VideoAnalysisPdf,
    { analysis: normalized }
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(node);
}
