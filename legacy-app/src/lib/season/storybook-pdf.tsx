import "server-only";
import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { StorybookContent } from "./ai-generator";
import type { SeasonStatsContext } from "./ai-generator";

const NAVY = "#102A43";
const ROYAL = "#2B6CB0";
const GOLD = "#F6C453";

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1A202C",
  },
  cover: {
    backgroundColor: NAVY,
    padding: 40,
    marginBottom: 20,
    borderRadius: 8,
  },
  coverTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
  },
  coverSub: {
    color: GOLD,
    fontSize: 13,
    marginTop: 8,
  },
  intro: {
    marginBottom: 16,
    color: "#334E68",
    fontSize: 11,
    lineHeight: 1.6,
  },
  chapter: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#CBD2D9",
    borderRadius: 8,
    overflow: "hidden",
  },
  chapterHeader: {
    backgroundColor: ROYAL,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chapterHeading: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 12,
  },
  chapterBody: {
    padding: 10,
    lineHeight: 1.6,
  },
  anecdoteTitle: {
    fontWeight: "bold",
    color: NAVY,
    fontSize: 11,
    marginBottom: 2,
    marginTop: 8,
  },
  anecdote: {
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
    marginBottom: 8,
  },
  conclusion: {
    backgroundColor: "#F0F4F8",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    color: NAVY,
    fontSize: 11,
    lineHeight: 1.6,
  },
  footer: {
    textAlign: "center",
    color: "#9FB3C8",
    fontSize: 8,
    marginTop: 16,
  },
});

function StorybookDoc({
  content,
  ctx,
}: {
  content: StorybookContent;
  ctx: SeasonStatsContext;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.coverTitle}>{content.title}</Text>
          <Text style={styles.coverSub}>
            {ctx.teamName} · Saison {ctx.season}
            {ctx.results.length > 0
              ? ` · ${ctx.won}V / ${ctx.drawn}N / ${ctx.lost}D`
              : ""}
          </Text>
        </View>

        {content.intro ? <Text style={styles.intro}>{content.intro}</Text> : null}

        {content.chapters.map((c, i) => (
          <View key={i} style={styles.chapter}>
            <View style={styles.chapterHeader}>
              <Text style={styles.chapterHeading}>
                {i + 1}. {c.heading}
              </Text>
            </View>
            <Text style={styles.chapterBody}>{c.text}</Text>
          </View>
        ))}

        {content.anecdotes.length > 0 && (
          <View style={styles.chapter}>
            <View style={styles.chapterHeader}>
              <Text style={styles.chapterHeading}>Petites histoires de la saison</Text>
            </View>
            <View style={styles.chapterBody}>
              {content.anecdotes.map((a, i) => (
                <View key={i} style={styles.anecdote}>
                  <Text style={styles.anecdoteTitle}>{a.title}</Text>
                  <Text>{a.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {content.conclusion ? (
          <Text style={styles.conclusion}>{content.conclusion}</Text>
        ) : null}

        <Text style={styles.footer}>Livret de saison généré par Benchrs</Text>
      </Page>
    </Document>
  );
}

export async function renderStorybookPdf(
  content: StorybookContent,
  ctx: SeasonStatsContext
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const node = React.createElement(StorybookDoc, {
    content,
    ctx,
  }) as React.ReactElement<React.ComponentProps<typeof Document>>;
  return renderToBuffer(node);
}
