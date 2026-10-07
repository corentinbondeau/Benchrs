import "server-only";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#102A43";
const GOLD = "#F6C453";

export interface LicenceAttestationData {
  clubName: string;
  clubFffNumber: string | null;
  teamName: string;
  season: string;
  lastName: string;
  firstName: string;
  birthDate: string | null;
  category: string | null;
  licenceNumber: string | null;
  status: string;
  issuedAt: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#1A202C",
  },
  header: {
    backgroundColor: NAVY,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  headerSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 9,
    marginTop: 4,
  },
  goldDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: GOLD,
  },
  title: {
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
    color: NAVY,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    textAlign: "center",
    color: "#486581",
    marginBottom: 22,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 9,
  },
  rowLabel: {
    width: 160,
    fontWeight: "bold",
    color: NAVY,
  },
  rowValue: {
    flex: 1,
  },
  statusBadge: {
    backgroundColor: GOLD,
    color: NAVY,
    fontSize: 9,
    fontWeight: "bold",
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },
  footer: {
    marginTop: 28,
    textAlign: "center",
    fontSize: 8.5,
    color: "#829AB1",
  },
});

function LicenceAttestationPdf({ data }: { data: LicenceAttestationData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{data.clubName}</Text>
            <Text style={styles.headerSub}>
              {data.clubFffNumber ? `Affilié FFF — n° ${data.clubFffNumber}` : "Club affilié FFF"} · Saison {data.season}
            </Text>
          </View>
          <View style={styles.goldDot} />
        </View>

        <Text style={styles.title}>Attestation de licence</Text>
        <Text style={styles.subtitle}>
          Document délivré pour la saison {data.season} — {data.teamName}
        </Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Licencié(e)</Text>
          <Text style={styles.rowValue}>
            {data.lastName.toUpperCase()} {data.firstName}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Né(e) le</Text>
          <Text style={styles.rowValue}>{data.birthDate || "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Catégorie</Text>
          <Text style={styles.rowValue}>{data.category || "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Équipe</Text>
          <Text style={styles.rowValue}>{data.teamName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>N° de licence</Text>
          <Text style={styles.rowValue}>{data.licenceNumber || "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Statut</Text>
          <Text style={styles.statusBadge}>
            {data.status === "valid" ? "VALIDÉE" : data.status === "pending_documents" ? "EN ATTENTE DE DOCUMENTS" : "EXPIRÉE"}
          </Text>
        </View>

        <Text style={styles.footer}>
          Attestation émise le {data.issuedAt} par Benchrs — au titre de l&apos;affiliation du club
        </Text>
      </Page>
    </Document>
  );
}

export async function renderLicenceAttestationPdf(
  data: LicenceAttestationData
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const node = React.createElement(
    LicenceAttestationPdf,
    { data }
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(node);
}