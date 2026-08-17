// Mock data pour tester l'import DOFA localement quand l'API est down
// A utiliser uniquement en développement!

export const MOCK_CLUBS_DATA: Record<string, any> = {
  "525816": {
    equipes: [
      {
        eqNo: "525816A",
        libelle: "AS Monaco (Ligue 1)",
        competition: { libelle: "Ligue 1 2025-2026" }
      },
      {
        eqNo: "525816B",
        libelle: "AS Monaco (Ligue 2)",
        competition: { libelle: "Ligue 2 2025-2026" }
      }
    ]
  },
  "monaco": {
    equipes: [
      {
        eqNo: "525816A",
        libelle: "AS Monaco (Ligue 1)",
        competition: { libelle: "Ligue 1 2025-2026" }
      },
      {
        eqNo: "525816B",
        libelle: "AS Monaco (Ligue 2)",
        competition: { libelle: "Ligue 2 2025-2026" }
      },
      {
        eqNo: "525816C",
        libelle: "AS Monaco Futsal",
        competition: { libelle: "Elite Futsal 2025-2026" }
      }
    ]
  },
  "psg": {
    equipes: [
      {
        eqNo: "750001A",
        libelle: "Paris Saint-Germain",
        competition: { libelle: "Ligue 1 2025-2026" }
      }
    ]
  }
};

export const MOCK_MATCHES = [
  {
    idRencontre: "match001",
    dateMatch: "2025-08-16",
    heureMatch: "20:45",
    libelle: "AS Monaco vs PSG",
    equipeAccueil: { libelle: "AS Monaco", score: 2 },
    equipeVisiteur: { libelle: "PSG", score: 1 },
    stade: { libelle: "Stade Louis II" }
  },
  {
    idRencontre: "match002",
    dateMatch: "2025-08-23",
    heureMatch: "20:00",
    libelle: "Olympique Lyonnais vs AS Monaco",
    equipeAccueil: { libelle: "Olympique Lyonnais", score: 0 },
    equipeVisiteur: { libelle: "AS Monaco", score: 3 },
    stade: { libelle: "Parc Olympique Lyonnais" }
  },
  {
    idRencontre: "match003",
    dateMatch: "2025-08-30",
    heureMatch: "17:00",
    libelle: "AS Monaco vs Marseille",
    equipeAccueil: { libelle: "AS Monaco", score: null },
    equipeVisiteur: { libelle: "Marseille", score: null },
    stade: { libelle: "Stade Louis II" }
  }
];

export const MOCK_STANDINGS = [
  {
    libelle: "AS Monaco",
    nbPoints: 6,
    joues: 2,
    victoires: 2,
    nuls: 0,
    defaites: 0,
    butsPour: 5,
    butsContre: 1
  },
  {
    libelle: "Paris Saint-Germain",
    nbPoints: 3,
    joues: 1,
    victoires: 1,
    nuls: 0,
    defaites: 0,
    butsPour: 3,
    butsContre: 0
  },
  {
    libelle: "Olympique Lyonnais",
    nbPoints: 0,
    joues: 1,
    victoires: 0,
    nuls: 0,
    defaites: 1,
    butsPour: 0,
    butsContre: 3
  },
  {
    libelle: "Marseille",
    nbPoints: 0,
    joues: 0,
    victoires: 0,
    nuls: 0,
    defaites: 0,
    butsPour: 0,
    butsContre: 0
  }
];

export function getMockData(query: { fffNumber?: string; clubName?: string; type?: string }) {
  const { fffNumber, clubName, type } = query;
  
  let key = fffNumber || clubName || "";
  key = key.toLowerCase();
  
  const data = MOCK_CLUBS_DATA[key];
  
  if (!data) {
    return null;
  }

  const result: any = { equipes: data.equipes };

  if (type === "all" || type === "calendar") {
    result.matches = MOCK_MATCHES;
  }

  if (type === "all" || type === "standings") {
    result.standings = MOCK_STANDINGS;
  }

  return result;
}
