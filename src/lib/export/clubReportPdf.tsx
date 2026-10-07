import "server-only";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ClubSeasonReport } from "@/lib/club/seasonReport";

const NAVY = "#102A43";
const GOLD = "#F6C453";
const ROYAL = "#2B6CB0";

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
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
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  summaryBox: {
    backgroundColor: "#EBF0F5",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "bold",
    color: NAVY,
    marginRight: 4,
  },
  summaryLabel: {
    fontSize: 8.5,
    color: "#486581",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: ROYAL,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 7.5,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  rowAlt: {
    backgroundColor: "#F7FAFC",
  },
  colTeam: { flex: 1.6 },
  colNum: { width: 44, textAlign: "right" },
  colVnd: { width: 58, textAlign: "right" },
  colGoals: { width: 52, textAlign: "right" },
  colAtt: { width: 46, textAlign: "right" },
  colLic: { width: 52, textAlign: "right" },
  colCotis: { width: 58, textAlign: "right" },
  colTres: { width: 58, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    backgroundColor: NAVY,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  totalText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "bold",
  },
  footer: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 8,
    color: "#829AB1",
  },
});

function HeaderCell({ style, label }: { style: Style; label: string }) {
  return <Text style={style}>{label}</Text>;
}

function ReportPdf({ report }: { report: ClubSeasonReport }) {
  const t = report.totals;
  const fmtEur = (n: number) =>
    n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Rapport de saison — {report.clubName}</Text>
          <View style={styles.headerMeta}>
            <Text style={styles.headerBadge}>Saison {report.season}</Text>
            {report.clubFffNumber && (
              <Text style={styles.headerBadgeLight}>FFF {report.clubFffNumber}</Text>
            )}
            <Text style={styles.headerBadgeLight}>
              Exporté le {new Date().toLocaleDateString("fr-FR")}
            </Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>{t.players}</Text>
            <Text style={styles.summaryLabel}>joueurs</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>{t.matches}</Text>
            <Text style={styles.summaryLabel}>matchs ({t.wins}V {t.draws}N {t.losses}D)</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>
              {t.goalsFor}–{t.goalsAgainst}
            </Text>
            <Text style={styles.summaryLabel}>buts pour/contre</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>
              {t.licencesValid}/{t.licencesTotal}
            </Text>
            <Text style={styles.summaryLabel}>licences</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>
              {fmtEur(t.cotisationsPaid)}/{fmtEur(t.cotisationsExpected)}
            </Text>
            <Text style={styles.summaryLabel}>cotisations</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>+{fmtEur(t.income)}</Text>
            <Text style={styles.summaryLabel}>recettes</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryValue}>−{fmtEur(t.expense)}</Text>
            <Text style={styles.summaryLabel}>dépenses</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <HeaderCell style={styles.colTeam} label="Équipe" />
          <HeaderCell style={styles.colNum} label="Joueurs" />
          <HeaderCell style={styles.colNum} label="Matchs" />
          <HeaderCell style={styles.colVnd} label="V-N-D" />
          <HeaderCell style={styles.colGoals} label="BP–BC" />
          <HeaderCell style={styles.colAtt} label="Assid." />
          <HeaderCell style={styles.colLic} label="Licences" />
          <HeaderCell style={styles.colCotis} label="Cotis." />
          <HeaderCell style={styles.colTres} label="Tréso incl." />
        </View>

        {report.teams.map((team, i) => (
          <View key={team.teamId} style={[styles.row, ...(i % 2 === 1 ? [styles.rowAlt] : [])]}>
            <Text style={styles.colTeam}>{team.teamName}</Text>
            <Text style={styles.colNum}>{team.players}</Text>
            <Text style={styles.colNum}>{team.matches}</Text>
            <Text style={styles.colVnd}>
              {team.wins}V {team.draws}N {team.losses}D
            </Text>
            <Text style={styles.colGoals}>
              {team.goalsFor}–{team.goalsAgainst}
            </Text>
            <Text style={styles.colAtt}>
              {team.attendanceAvg === null ? "—" : `${team.attendanceAvg}%`}
            </Text>
            <Text style={styles.colLic}>
              {team.licencesValid}/{team.licencesTotal}
            </Text>
            <Text style={styles.colCotis}>
              {fmtEur(team.cotisationsPaid)}/{fmtEur(team.cotisationsExpected)}
            </Text>
            <Text style={styles.colTres}>
              {team.expense === 0 && team.income === 0 ? "—" : `${fmtEur(team.income - team.expense)}`}
            </Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={[styles.colTeam, styles.totalText]}>Total club</Text>
          <Text style={[styles.colNum, styles.totalText]}>{t.players}</Text>
          <Text style={[styles.colNum, styles.totalText]}>{t.matches}</Text>
          <Text style={[styles.colVnd, styles.totalText]}>
            {t.wins}V {t.draws}N {t.losses}D
          </Text>
          <Text style={[styles.colGoals, styles.totalText]}>
            {t.goalsFor}–{t.goalsAgainst}
          </Text>
          <Text style={[styles.colAtt, styles.totalText]} />
          <Text style={[styles.colLic, styles.totalText]}>
            {t.licencesValid}/{t.licencesTotal}
          </Text>
          <Text style={[styles.colCotis, styles.totalText]}>
            {fmtEur(t.cotisationsPaid)}/{fmtEur(t.cotisationsExpected)}
          </Text>
          <Text style={[styles.colTres, styles.totalText]}>{fmtEur(t.income - t.expense)}</Text>
        </View>

        <Text style={styles.footer}>Généré par Benchrs — Rapport de saison du club</Text>
      </Page>
    </Document>
  );
}

export async function renderClubReportPdf(report: ClubSeasonReport): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const node = React.createElement(
    ReportPdf,
    { report }
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(node);
}