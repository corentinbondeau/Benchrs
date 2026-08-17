import "server-only";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#102A43";
const GOLD = "#F6C453";
const GREEN = "#2F855A";

export interface FeuilletPlayer {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
}

export interface FeuilletPosition {
  player_id: string | null;
  x: number;
  y: number;
  label: string;
}

export interface FeuilletPdfData {
  teamName: string;
  eventTitle: string;
  eventDate: string;
  formationName: string;
  positions: FeuilletPosition[];
  bench: (string | null)[];
  captain_id: string | null;
  players: FeuilletPlayer[];
}

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1A202C",
  },
  header: {
    backgroundColor: NAVY,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  headerMeta: {
    color: GOLD,
    fontSize: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 6,
    color: NAVY,
  },
  pitch: {
    backgroundColor: GREEN,
    borderRadius: 6,
    height: 340,
    marginBottom: 14,
    position: "relative",
  },
  pitchLine: {
    position: "absolute",
    left: "50%",
    width: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  slotCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: NAVY,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
  },
  slotCircleCaptain: {
    backgroundColor: GOLD,
  },
  slotNumber: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
  slotNumberCaptain: {
    color: NAVY,
  },
  slotLabel: {
    fontSize: 6,
    color: "rgba(255,255,255,0.7)",
    position: "absolute",
    textAlign: "center",
    width: 40,
  },
  benchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E2E8F0",
  },
  benchNumber: {
    width: 24,
    fontSize: 9,
    fontWeight: "bold",
    color: NAVY,
  },
  benchName: {
    fontSize: 9,
    flex: 1,
  },
  benchCaptain: {
    fontSize: 8,
    color: GOLD,
    fontWeight: "bold",
  },
  emptySlot: {
    fontSize: 9,
    color: "#A0AEC0",
    fontStyle: "italic",
  },
});

function playerById(
  players: FeuilletPlayer[],
  id: string | null
): FeuilletPlayer | null {
  if (!id) return null;
  return players.find((p) => p.id === id) || null;
}

function FeuilletPitch({
  positions,
  players,
  captainId,
}: {
  positions: FeuilletPosition[];
  players: FeuilletPlayer[];
  captainId: string | null;
}) {
  return (
    <View style={styles.pitch}>
      {/* Ligne centrale */}
      <View style={[styles.pitchLine, { top: "50%", left: 0, right: 0, width: "100%", height: 1 }]} />
      {/* Cercle central */}
      <View
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 60,
          height: 60,
          borderRadius: 30,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.2)",
          marginLeft: -30,
          marginTop: -30,
        }}
      />
      {positions.map((pos, i) => {
        const player = playerById(players, pos.player_id);
        const isCaptain = pos.player_id === captainId;
        const left = `${pos.x}%`;
        const top = `${pos.y}%`;
        return (
          <View key={i} style={{ position: "absolute", left, top, alignItems: "center", marginLeft: -14, marginTop: -14 }}>
            <View style={isCaptain ? styles.slotCircleCaptain : styles.slotCircle}>
              <Text style={isCaptain ? styles.slotNumberCaptain : styles.slotNumber}>
                {player?.shirt_number ?? "?"}
              </Text>
            </View>
            <Text style={[styles.slotLabel, { marginTop: 2 }]}>
              {player ? `${player.first_name.charAt(0)}. ${player.last_name}` : pos.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export async function renderFeuilletPdf(data: FeuilletPdfData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Feuillet de match</Text>
          <Text style={styles.headerMeta}>
            {data.teamName} — {data.formationName}
          </Text>
          <Text style={styles.headerMeta}>
            {data.eventTitle} · {data.eventDate}
          </Text>
        </View>

        {/* Terrain avec positions */}
        <Text style={styles.sectionTitle}>Composition</Text>
        <FeuilletPitch
          positions={data.positions}
          players={data.players}
          captainId={data.captain_id}
        />

        {/* Banc */}
        <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Remplaçants</Text>
        {data.bench.map((pid, i) => {
          const player = playerById(data.players, pid);
          const isCaptain = pid === data.captain_id;
          return (
            <View key={i} style={styles.benchRow}>
              <Text style={styles.benchNumber}>{player?.shirt_number ?? "—"}</Text>
              {player ? (
                <>
                  <Text style={styles.benchName}>
                    {player.first_name} {player.last_name}
                  </Text>
                  {isCaptain && <Text style={styles.benchCaptain}>©</Text>}
                </>
              ) : (
                <Text style={styles.emptySlot}>—</Text>
              )}
            </View>
          );
        })}
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);
  return Buffer.from(buffer);
}
