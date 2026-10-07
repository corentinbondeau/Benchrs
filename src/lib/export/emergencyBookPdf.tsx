import "server-only";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#102A43";
const GOLD = "#F6C453";
const RED = "#C53030";

export interface EmergencyBookPlayer {
  lastName: string;
  firstName: string;
  birthDate: string | null;
  category: string | null;
  phone: string | null;
  allergies: string | null;
  emergencyContact: string | null;
  medicalCertExpiresAt: string | null;
}

export interface EmergencyBookData {
  clubName: string;
  teamName: string;
  eventLabel: string;
  eventDate: string | null;
  generatedAt: string;
  players: EmergencyBookPlayer[];
}

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
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  headerSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 8.5,
    marginTop: 3,
  },
  goldDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: GOLD,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: NAVY,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  th: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "bold",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  cellName: { width: "22%" },
  cellBirth: { width: "11%" },
  cellCat: { width: "10%" },
  cellPhone: { width: "14%" },
  cellAllergies: { width: "18%" },
  cellContact: { width: "18%" },
  cellCert: { width: "7%" },
  txt: { fontSize: 8.5 },
  txtBold: { fontSize: 8.5, fontWeight: "bold", color: NAVY },
  red: { fontSize: 8.5, color: RED, fontWeight: "bold" },
  muted: { fontSize: 8, color: "#829AB1" },
  empty: {
    textAlign: "center",
    color: "#829AB1",
    fontSize: 10,
    marginTop: 24,
  },
});

function EmergencyBookPdf({ data }: { data: EmergencyBookData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Cahier des urgences</Text>
            <Text style={styles.headerSub}>
              {data.clubName} · {data.teamName} — {data.eventLabel}
              {data.eventDate ? ` · ${data.eventDate}` : ""}
            </Text>
          </View>
          <View style={styles.goldDot} />
        </View>

        <View style={styles.tableHead}>
          <View style={styles.cellName}><Text style={styles.th}>Joueur</Text></View>
          <View style={styles.cellBirth}><Text style={styles.th}>Né(e) le</Text></View>
          <View style={styles.cellCat}><Text style={styles.th}>Catégorie</Text></View>
          <View style={styles.cellPhone}><Text style={styles.th}>Téléphone</Text></View>
          <View style={styles.cellAllergies}><Text style={styles.th}>Allergies</Text></View>
          <View style={styles.cellContact}><Text style={styles.th}>Personne à contacter</Text></View>
          <View style={styles.cellCert}><Text style={styles.th}>Certif. médical</Text></View>
        </View>

        {data.players.length === 0 ? (
          <Text style={styles.empty}>Aucun joueur présent pour cet événement.</Text>
        ) : (
          data.players.map((p, i) => (
            <View key={i} style={styles.row}>
              <View style={styles.cellName}>
                <Text style={styles.txtBold}>
                  {p.lastName.toUpperCase()} {p.firstName}
                </Text>
              </View>
              <View style={styles.cellBirth}>
                <Text style={styles.txt}>{p.birthDate || "—"}</Text>
              </View>
              <View style={styles.cellCat}>
                <Text style={styles.txt}>{p.category || "—"}</Text>
              </View>
              <View style={styles.cellPhone}>
                <Text style={styles.txt}>{p.phone || "—"}</Text>
              </View>
              <View style={styles.cellAllergies}>
                {p.allergies ? (
                  <Text style={styles.red}>{p.allergies}</Text>
                ) : (
                  <Text style={styles.muted}>Aucune</Text>
                )}
              </View>
              <View style={styles.cellContact}>
                <Text style={styles.txt}>{p.emergencyContact || "—"}</Text>
              </View>
              <View style={styles.cellCert}>
                <Text style={p.medicalCertExpiresAt ? styles.txt : styles.red}>
                  {p.medicalCertExpiresAt || "?"}
                </Text>
              </View>
            </View>
          ))
        )}

        <Text style={{ marginTop: 24, textAlign: "center", fontSize: 8, color: "#829AB1" }}>
          Édité le {data.generatedAt} par Benchrs — document confidentiel, à conserver le jour du match.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderEmergencyBookPdf(data: EmergencyBookData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const node = React.createElement(
    EmergencyBookPdf,
    { data }
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(node);
}