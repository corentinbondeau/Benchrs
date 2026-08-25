import "server-only";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#102A43";
const GOLD = "#F6C453";
const ROYAL = "#2B6CB0";

export interface RosterRow {
  first_name: string;
  last_name: string;
  position: string | null;
  shirt_number: number | null;
  birth_year: string | null;
  vma: number | null;
  vmi: number | null;
  active: boolean;
}

export interface RosterPdfData {
  teamName: string;
  season: string;
  exportedAt: string;
  coaches: RosterRow[];
  players: RosterRow[];
}

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
  sectionTitle: {
    backgroundColor: ROYAL,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  rowAlt: {
    backgroundColor: "#F7FAFC",
  },
  colNumber: {
    width: 34,
    fontWeight: "bold",
    color: NAVY,
  },
  colName: {
    flex: 1,
  },
  colPosition: {
    width: 130,
    color: "#486581",
  },
  colYear: {
    width: 70,
    color: "#486581",
  },
  colVma: {
    width: 54,
    textAlign: "right",
  },
  colVmi: {
    width: 54,
    textAlign: "right",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#EBF0F5",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 8.5,
    fontWeight: "bold",
    color: "#486581",
    marginTop: 6,
  },
  colHeaderNumber: { width: 34 },
  colHeaderName: { flex: 1 },
  colHeaderPosition: { width: 130 },
  colHeaderYear: { width: 70 },
  colHeaderVma: { width: 54, textAlign: "right" },
  colHeaderVmi: { width: 54, textAlign: "right" },
  footer: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 8,
    color: "#829AB1",
  },
});

function RosterTable({ rows }: { rows: RosterRow[] }) {
  return (
    <View>
      <View style={styles.tableHeader}>
        <Text style={styles.colHeaderNumber}>N°</Text>
        <Text style={styles.colHeaderName}>Nom</Text>
        <Text style={styles.colHeaderPosition}>Poste</Text>
        <Text style={styles.colHeaderYear}>Naissance</Text>
        <Text style={styles.colHeaderVma}>VMA</Text>
        <Text style={styles.colHeaderVmi}>VMI</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[styles.row, ...(i % 2 === 1 ? [styles.rowAlt] : [])]}>
          <Text style={styles.colNumber}>{r.shirt_number ?? "-"}</Text>
          <Text style={styles.colName}>
            {r.last_name.toUpperCase()} {r.first_name}
          </Text>
          <Text style={styles.colPosition}>{r.position || "Joueur"}</Text>
          <Text style={styles.colYear}>{r.birth_year || "-"}</Text>
          <Text style={styles.colVma}>{r.vma ?? "-"}</Text>
          <Text style={styles.colVmi}>{r.vmi ?? "-"}</Text>
        </View>
      ))}
    </View>
  );
}

function RosterPdf({ data }: { data: RosterPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{data.teamName} — Effectif</Text>
          <View style={styles.headerMeta}>
            <Text style={styles.headerBadge}>Saison {data.season}</Text>
            <Text style={styles.headerBadgeLight}>Exporté le {data.exportedAt}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Coachs ({data.coaches.length})</Text>
        <RosterTable rows={data.coaches} />

        <Text style={styles.sectionTitle}>Joueurs ({data.players.length})</Text>
        <RosterTable rows={data.players} />

        <Text style={styles.footer}>Généré par Benchrs — Effectif de l&apos;équipe</Text>
      </Page>
    </Document>
  );
}

export async function renderRosterPdf(data: RosterPdfData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const node = React.createElement(
    RosterPdf,
    { data }
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(node);
}
