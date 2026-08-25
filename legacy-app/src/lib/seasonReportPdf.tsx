import "server-only";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { SeasonReportContent } from "@/app/api/season/report/route";

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
    padding: 18,
    marginBottom: 14,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  headerSub: {
    color: "#D9E2EC",
    fontSize: 11,
    marginTop: 6,
  },
  noteBadge: {
    backgroundColor: GOLD,
    color: NAVY,
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "bold",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: NAVY,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 4,
    marginBottom: 8,
  },
  summary: {
    fontSize: 10,
    lineHeight: 1.5,
    color: "#2D3748",
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bullet: {
    width: 10,
    color: NAVY,
    fontSize: 10,
    lineHeight: 1.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.5,
    color: "#2D3748",
  },
  bilanRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  bilanCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 8,
    marginRight: 6,
  },
  bilanLabel: {
    fontSize: 9,
    color: "#718096",
  },
  bilanValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: NAVY,
    marginTop: 2,
  },
  playerRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#EDF2F7",
  },
  playerName: {
    flex: 2,
    fontSize: 9,
    fontWeight: "bold",
  },
  playerCell: {
    flex: 1,
    fontSize: 9,
    textAlign: "center",
  },
  topPlayer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  topBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GOLD,
    color: NAVY,
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 20,
    marginRight: 8,
  },
  topName: {
    fontSize: 10,
    fontWeight: "bold",
    flex: 1,
  },
  topReason: {
    flex: 2,
    fontSize: 9,
    color: "#4A5568",
  },
});

function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow} wrap={false}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </>
  );
}

function SeasonReportDocument({
  report,
  teamName,
  season,
}: {
  report: SeasonReportContent;
  teamName: string;
  season: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{report.title}</Text>
          <Text style={styles.headerSub}>
            {teamName} · Saison {season}
          </Text>
          <Text style={styles.noteBadge}>Note de l&apos;équipe : {report.note_equipe}/10</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bilan de la saison</Text>
          <Text style={styles.summary}>{report.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Points forts</Text>
          <BulletList items={report.points_forts} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Points à améliorer</Text>
          <BulletList items={report.points_faibles} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Axes de progression pour la saison prochaine</Text>
          <BulletList items={report.axes_progression} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meilleurs joueurs de la saison</Text>
          {report.meilleurs_joueurs.map((m, i) => (
            <View key={i} style={styles.topPlayer} wrap={false}>
              <Text style={styles.topBadge}>{i + 1}</Text>
              <Text style={styles.topName}>{m.nom}</Text>
              <Text style={styles.topReason}>{m.raison}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Récompenses individuelles</Text>
          <BulletList
            items={[
              report.meilleur_buteur ? `Meilleur buteur : ${report.meilleur_buteur}` : null,
              report.meilleure_passeur ? `Meilleur passeur : ${report.meilleure_passeur}` : null,
              report.joueur_plus_present ? `Joueur le plus présent : ${report.joueur_plus_present}` : null,
            ].filter((x): x is string => !!x)}
          />
        </View>

        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={[styles.summary, { color: "#A0AEC0", fontSize: 8 }]}>
            Rapport généré par Benchrs · Saison {season}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderSeasonReportPdf(
  report: SeasonReportContent,
  teamName: string,
  season: string
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(
    <SeasonReportDocument report={report} teamName={teamName} season={season} />
  ) as unknown as Promise<Buffer>;
}
