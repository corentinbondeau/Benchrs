import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#102A43";
const GOLD = "#F6C453";

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
    fontSize: 16,
    fontWeight: "bold",
  },
  headerSub: {
    color: "#D9E2EC",
    fontSize: 10,
    marginTop: 4,
  },
  badge: {
    backgroundColor: GOLD,
    color: NAVY,
    alignSelf: "flex-start",
    fontSize: 9,
    fontWeight: "bold",
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: NAVY,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 4,
    marginBottom: 8,
    marginTop: 12,
  },
  statsRow: {
    flexDirection: "row",
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 8,
    marginRight: 6,
  },
  statLabel: {
    fontSize: 8,
    color: "#718096",
  },
  statValue: {
    fontSize: 15,
    fontWeight: "bold",
    color: NAVY,
    marginTop: 2,
  },
  statDiff: {
    fontSize: 8,
    marginTop: 2,
  },
  diffUp: { color: "#16A34A" },
  diffDown: { color: "#DC2626" },
  diffSame: { color: "#718096" },
  matchRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#EDF2F7",
  },
  matchDate: {
    width: 60,
    fontSize: 9,
    color: "#718096",
  },
  matchOpp: {
    flex: 2,
    fontSize: 9,
    fontWeight: "bold",
  },
  matchScore: {
    width: 40,
    fontSize: 9,
    textAlign: "center",
  },
  matchCell: {
    width: 40,
    fontSize: 9,
    textAlign: "center",
  },
  headRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#CBD5E0",
    backgroundColor: "#F7FAFC",
  },
  headCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#4A5568",
  },
  empty: {
    textAlign: "center",
    color: "#718096",
    marginVertical: 10,
    fontSize: 10,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 28,
    right: 28,
    textAlign: "center",
    fontSize: 8,
    color: "#A0AEC0",
  },
});

export interface PlayerSeasonMatch {
  event_date: string | null;
  opponent: string | null;
  title: string | null;
  score_us: number | null;
  score_them: number | null;
  goals: number;
  assists: number;
  minutes_played: number;
}

export interface PlayerSeasonStat {
  label: string;
  cur: number;
  prev: number | null;
}

interface Props {
  playerName: string;
  season: string;
  stats: PlayerSeasonStat[];
  matches: PlayerSeasonMatch[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()}`;
}

function PlayerSeasonFiche({ playerName, season, stats, matches }: Props) {
  return (
    <Document>
      <Page style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{playerName}</Text>
          <Text style={styles.headerSub}>
            Historique de la saison {season.replace("/", "-")}
          </Text>
          <Text style={styles.badge}>Benchrs</Text>
        </View>

        <Text style={styles.sectionTitle}>Bilan de la saison</Text>
        <View style={styles.statsRow}>
          {stats.map((s) => {
            const diff = s.prev !== null ? s.cur - s.prev : null;
            return (
              <View key={s.label} style={styles.statCard}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.cur}</Text>
                {diff !== null && diff !== 0 && (
                  <Text style={[styles.statDiff, diff > 0 ? styles.diffUp : styles.diffDown]}>
                    {diff > 0 ? "+" : ""}
                    {diff}
                  </Text>
                )}
                {diff !== null && diff === 0 && (
                  <Text style={[styles.statDiff, styles.diffSame]}>Égal</Text>
                )}
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Détail par match</Text>
        {matches.length === 0 ? (
          <Text style={styles.empty}>Aucun match enregistré cette saison.</Text>
        ) : (
          <>
            <View style={styles.headRow}>
              <Text style={[styles.matchDate, styles.headCell]}>Date</Text>
              <Text style={[styles.matchOpp, styles.headCell]}>Adversaire</Text>
              <Text style={[styles.matchScore, styles.headCell]}>Score</Text>
              <Text style={[styles.matchCell, styles.headCell]}>Buts</Text>
              <Text style={[styles.matchCell, styles.headCell]}>Passes</Text>
              <Text style={[styles.matchCell, styles.headCell]}>Min</Text>
            </View>
            {matches.map((m, i) => (
              <View key={i} style={styles.matchRow}>
                <Text style={styles.matchDate}>{fmtDate(m.event_date)}</Text>
                <Text style={styles.matchOpp}>
                  {m.opponent || m.title || "—"}
                </Text>
                <Text style={styles.matchScore}>
                  {m.score_us !== null && m.score_them !== null
                    ? `${m.score_us}-${m.score_them}`
                    : "—"}
                </Text>
                <Text style={styles.matchCell}>{m.goals}</Text>
                <Text style={styles.matchCell}>{m.assists}</Text>
                <Text style={styles.matchCell}>{m.minutes_played}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.footer}>Généré par Benchrs — Fiche joueur</Text>
      </Page>
    </Document>
  );
}

export async function renderPlayerSeasonPdf(props: Props): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const node = React.createElement(PlayerSeasonFiche, props) as React.ReactElement<
    React.ComponentProps<typeof Document>
  >;
  return renderToBuffer(node);
}