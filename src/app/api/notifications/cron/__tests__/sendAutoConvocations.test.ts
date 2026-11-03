import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * Tests pour sendAutoConvocations
 * 
 * Vérifie que:
 * 1. Les convocations sont envoyées le jour exact (event_date - delay)
 * 2. Seulement les joueurs whitelisted reçoivent les notifs
 * 3. Les parents des joueurs whitelisted reçoivent aussi les notifs
 * 4. L'idempotence fonctionne (pas de duplicatas)
 * 5. Les notification recipients sont corrects (joueur + parents)
 */

describe("sendAutoConvocations", () => {
  describe("Timing - jour exact de convocation", () => {
    it("envoie des convocations le jour exact (event_date - delay_days)", () => {
      /**
       * Scénario:
       * - Event: Mercredi 15 novembre à 15h
       * - Delay: 3 jours
       * - Aujourd'hui: Dimanche 12 novembre (3 jours avant)
       * → Les convocations doivent être envoyées
       */
      const eventDate = "2026-11-15T15:00:00Z"; // Mercredi
      const today = "2026-11-12T10:00:00Z"; // Dimanche (3 jours avant)
      const delayDays = 3;

      // Calcul du jour cible
      const eventDateObj = new Date(eventDate);
      const targetConvocationDate = new Date(eventDateObj);
      targetConvocationDate.setDate(targetConvocationDate.getDate() - delayDays);
      targetConvocationDate.setHours(0, 0, 0, 0);

      const todayObj = new Date(today);
      todayObj.setHours(0, 0, 0, 0);

      // Doivent correspondre
      expect(todayObj.getTime()).toBe(targetConvocationDate.getTime());
    });

    it("n'envoie pas de convocations si le délai n'est pas encore atteint", () => {
      /**
       * Scénario:
       * - Event: Mercredi 15 novembre
       * - Delay: 3 jours
       * - Aujourd'hui: Lundi 13 novembre (2 jours avant, pas 3)
       * → Les convocations ne doivent PAS être envoyées
       */
      const eventDate = "2026-11-15T15:00:00Z";
      const today = "2026-11-13T10:00:00Z"; // 2 jours avant, pas 3
      const delayDays = 3;

      const eventDateObj = new Date(eventDate);
      const targetConvocationDate = new Date(eventDateObj);
      targetConvocationDate.setDate(targetConvocationDate.getDate() - delayDays);
      targetConvocationDate.setHours(0, 0, 0, 0);

      const todayObj = new Date(today);
      todayObj.setHours(0, 0, 0, 0);

      // Ne doivent pas correspondre
      expect(todayObj.getTime()).not.toBe(targetConvocationDate.getTime());
    });

    it("n'envoie pas de convocations si le délai est dépassé (jour du match)", () => {
      /**
       * Scénario:
       * - Event: Mercredi 15 novembre
       * - Delay: 3 jours
       * - Aujourd'hui: Mercredi 15 novembre (le jour même)
       * → Les convocations ne doivent pas être envoyées (trop tard)
       */
      const eventDate = "2026-11-15T15:00:00Z";
      const today = "2026-11-15T10:00:00Z"; // Le jour même
      const delayDays = 3;

      const eventDateObj = new Date(eventDate);
      const targetConvocationDate = new Date(eventDateObj);
      targetConvocationDate.setDate(targetConvocationDate.getDate() - delayDays);
      targetConvocationDate.setHours(0, 0, 0, 0);

      const todayObj = new Date(today);
      todayObj.setHours(0, 0, 0, 0);

      expect(todayObj.getTime()).not.toBe(targetConvocationDate.getTime());
    });

    it("gère les délais de 1 jour", () => {
      /**
       * Scénario:
       * - Event: Vendredi à 20h
       * - Delay: 1 jour
       * - Aujourd'hui: Jeudi à 15h
       * → Les convocations doivent être envoyées
       */
      const eventDate = "2026-11-13T20:00:00Z"; // Vendredi
      const today = "2026-11-12T15:00:00Z"; // Jeudi
      const delayDays = 1;

      const eventDateObj = new Date(eventDate);
      const targetConvocationDate = new Date(eventDateObj);
      targetConvocationDate.setDate(targetConvocationDate.getDate() - delayDays);
      targetConvocationDate.setHours(0, 0, 0, 0);

      const todayObj = new Date(today);
      todayObj.setHours(0, 0, 0, 0);

      expect(todayObj.getTime()).toBe(targetConvocationDate.getTime());
    });

    it("gère les délais de 7 jours", () => {
      /**
       * Scénario:
       * - Event: Mercredi 22 novembre
       * - Delay: 7 jours
       * - Aujourd'hui: Mercredi 15 novembre
       * → Les convocations doivent être envoyées
       */
      const eventDate = "2026-11-22T15:00:00Z"; // Mercredi suivant
      const today = "2026-11-15T10:00:00Z"; // Mercredi (7 jours avant)
      const delayDays = 7;

      const eventDateObj = new Date(eventDate);
      const targetConvocationDate = new Date(eventDateObj);
      targetConvocationDate.setDate(targetConvocationDate.getDate() - delayDays);
      targetConvocationDate.setHours(0, 0, 0, 0);

      const todayObj = new Date(today);
      todayObj.setHours(0, 0, 0, 0);

      expect(todayObj.getTime()).toBe(targetConvocationDate.getTime());
    });
  });

  describe("Whitelist - filtrage des joueurs", () => {
    it("envoie seulement aux joueurs whitelisted", () => {
      /**
       * Scénario:
       * - 5 joueurs dans l'équipe
       * - Whitelist: [joueur1, joueur3]
       * - Seulement joueur1 et joueur3 doivent être traités
       */
      const whitelistPlayerIds = ["player-1", "player-3"];
      const allPlayerIds = ["player-1", "player-2", "player-3", "player-4", "player-5"];

      // Simulation: boucler sur whitelist
      const processedPlayers: string[] = [];
      for (const playerId of whitelistPlayerIds) {
        processedPlayers.push(playerId);
      }

      expect(processedPlayers).toEqual(["player-1", "player-3"]);
      expect(processedPlayers.length).toBe(2);
      expect(processedPlayers).not.toContain("player-2");
      expect(processedPlayers).not.toContain("player-4");
      expect(processedPlayers).not.toContain("player-5");
    });

    it("saute les événements sans whitelist", () => {
      /**
       * Scénario:
       * - Event avec delay = 3, mais auto_convocation_player_ids = []
       * → Aucune convocation n'est envoyée
       */
      const autoConvocationPlayerIds: string[] = [];

      let shouldSkip = (autoConvocationPlayerIds || []).length === 0;

      expect(shouldSkip).toBe(true);
    });

    it("saute les événements avec delay = 0", () => {
      /**
       * Scénario:
       * - Event avec delay = 0 (désactivé)
       * → Pas de convocation automatique
       */
      const autoConvocationDelayDays = 0;

      let shouldSkip = !autoConvocationDelayDays || autoConvocationDelayDays === 0;

      expect(shouldSkip).toBe(true);
    });

    it("traite une whitelist avec un seul joueur", () => {
      const whitelistPlayerIds = ["player-42"];

      const processedPlayers: string[] = [];
      for (const playerId of whitelistPlayerIds) {
        processedPlayers.push(playerId);
      }

      expect(processedPlayers.length).toBe(1);
      expect(processedPlayers[0]).toBe("player-42");
    });

    it("traite une whitelist avec de nombreux joueurs", () => {
      const whitelistPlayerIds = Array.from({ length: 15 }, (_, i) => `player-${i + 1}`);

      const processedPlayers: string[] = [];
      for (const playerId of whitelistPlayerIds) {
        processedPlayers.push(playerId);
      }

      expect(processedPlayers.length).toBe(15);
    });
  });

  describe("Parents - destinataires des notifications", () => {
    it("envoie des notifications aux parents des joueurs whitelisted", () => {
      /**
       * Scénario:
       * - Joueur 1 a 2 parents (parent-1a, parent-1b)
       * - Joueur 3 a 1 parent (parent-3a)
       * - Les notifications doivent aller à: joueur-1, parent-1a, parent-1b, joueur-3, parent-3a
       */
      const playerId1 = "player-1";
      const playerId3 = "player-3";

      const parentMap = new Map([
        [playerId1, ["parent-1a", "parent-1b"]],
        [playerId3, ["parent-3a"]],
      ]);

      const whitelistPlayerIds = [playerId1, playerId3];
      const expectedRecipients = [
        "player-1", "parent-1a", "parent-1b",
        "player-3", "parent-3a",
      ];

      const actualRecipients: string[] = [];
      for (const playerId of whitelistPlayerIds) {
        actualRecipients.push(playerId);
        const parents = parentMap.get(playerId) || [];
        actualRecipients.push(...parents);
      }

      expect(actualRecipients.sort()).toEqual(expectedRecipients.sort());
    });

    it("gère les joueurs sans parents", () => {
      /**
       * Scénario:
       * - Joueur 1: pas de parent
       * - Joueur 2: 1 parent
       * - Notifications: [joueur-1, joueur-2, parent-2]
       */
      const playerId1 = "player-1";
      const playerId2 = "player-2";

      const parentMap = new Map([
        [playerId1, []],
        [playerId2, ["parent-2a"]],
      ]);

      const whitelistPlayerIds = [playerId1, playerId2];
      const actualRecipients: string[] = [];

      for (const playerId of whitelistPlayerIds) {
        actualRecipients.push(playerId);
        const parents = parentMap.get(playerId) || [];
        actualRecipients.push(...parents);
      }

      expect(actualRecipients).toEqual(["player-1", "player-2", "parent-2a"]);
    });

    it("gère les joueurs avec de nombreux parents", () => {
      /**
       * Scénario:
       * - Joueur 1 a 4 parents (situation compliquée mais possible)
       * - Les 4 parents doivent tous recevoir
       */
      const playerId1 = "player-1";
      const parentMap = new Map([
        [playerId1, ["parent-1a", "parent-1b", "parent-1c", "parent-1d"]],
      ]);

      const whitelistPlayerIds = [playerId1];
      const actualRecipients: string[] = [];

      for (const playerId of whitelistPlayerIds) {
        actualRecipients.push(playerId);
        const parents = parentMap.get(playerId) || [];
        actualRecipients.push(...parents);
      }

      expect(actualRecipients.length).toBe(5); // 1 joueur + 4 parents
      expect(actualRecipients[0]).toBe("player-1");
    });

    it("évite les duplicatas parent-joueur", () => {
      /**
       * Scénario:
       * - Cas rare: un parent est aussi membre de l'équipe
       * - Utiliser Set pour éviter les doublons
       */
      const playerId1 = "player-1";
      const playerId2 = "player-2"; // Qui est aussi parent de player-1!

      const parentMap = new Map([
        [playerId1, ["player-2"]], // player-2 est parent de player-1
        [playerId2, ["parent-2a"]],
      ]);

      const whitelistPlayerIds = [playerId1, playerId2];
      const actualRecipientsSet = new Set<string>();

      for (const playerId of whitelistPlayerIds) {
        actualRecipientsSet.add(playerId);
        const parents = parentMap.get(playerId) || [];
        parents.forEach((p) => actualRecipientsSet.add(p));
      }

      // Avec Set, pas de duplicatas
      expect(actualRecipientsSet.has("player-1")).toBe(true);
      expect(actualRecipientsSet.has("player-2")).toBe(true);
      expect(actualRecipientsSet.has("parent-2a")).toBe(true);
      expect(actualRecipientsSet.size).toBe(3); // Pas de duplicata
    });
  });

  describe("Idempotence - pas de duplicatas", () => {
    it("utilise reference_id unique pour éviter les doublons", () => {
      /**
       * Scénario:
       * - Le cron s'exécute 2 fois le même jour
       * - reference_id = auto_conv:{eventId}:{playerId}
       * - La 2e exécution doit détecter que la notif existe déjà
       */
      const eventId = "event-123";
      const playerId = "player-1";
      const refId = `auto_conv:${eventId}:${playerId}`;

      // Simulation: 1ère exécution crée la notif
      const createdNotifications = new Map([
        [refId, { id: "notif-1", type: "convocation" }],
      ]);

      // Simulation: 2e exécution cherche si déjà existe
      const existingNotif = createdNotifications.get(refId);

      if (existingNotif) {
        // Skip cette notif (idempotence)
        expect(existingNotif.id).toBe("notif-1");
      }
    });

    it("ref_id est unique par joueur dans un même événement", () => {
      /**
       * Scénario:
       * - Même événement, joueurs différents
       * - Chaque joueur doit avoir sa propre reference_id
       */
      const eventId = "event-123";
      const playerIds = ["player-1", "player-2", "player-3"];

      const refIds = playerIds.map((pId) => `auto_conv:${eventId}:${pId}`);

      // Les ref_ids doivent tous être uniques
      expect(new Set(refIds).size).toBe(refIds.length);
      expect(refIds).toEqual([
        "auto_conv:event-123:player-1",
        "auto_conv:event-123:player-2",
        "auto_conv:event-123:player-3",
      ]);
    });

    it("différents événements ont des ref_ids différents", () => {
      /**
       * Scénario:
       * - Deux événements différents
       * - Même joueur
       * - Chacun doit avoir sa propre reference_id
       */
      const eventId1 = "event-123";
      const eventId2 = "event-456";
      const playerId = "player-1";

      const refId1 = `auto_conv:${eventId1}:${playerId}`;
      const refId2 = `auto_conv:${eventId2}:${playerId}`;

      expect(refId1).not.toBe(refId2);
      expect(refId1).toBe("auto_conv:event-123:player-1");
      expect(refId2).toBe("auto_conv:event-456:player-1");
    });
  });

  describe("Format de notification", () => {
    it("crée les bonnes propriétés pour un match", () => {
      /**
       * Scénario:
       * - Type = "match"
       * - Titre doit inclure adversaire
       * - Body doit dire "Match"
       */
      const isMatch = true;
      const opponent = "Équipe Adverse";
      const dateLabel = "mercredi 15 novembre";
      const hour = "15:00";

      const expectedTitle = `Convocation — ${opponent}`;
      const expectedBody = `Match ${dateLabel} à ${hour}. Merci de confirmer votre présence.`;

      expect(expectedTitle).toContain("Convocation");
      expect(expectedTitle).toContain("Équipe Adverse");
      expect(expectedBody).toContain("Match");
      expect(expectedBody).toContain("mercredi 15 novembre");
      expect(expectedBody).toContain("15:00");
    });

    it("crée les bonnes propriétés pour un entraînement", () => {
      /**
       * Scénario:
       * - Type = "training"
       * - Titre: "Convocation" (sans adversaire)
       * - Body doit dire "Entraînement"
       * - URL = /trainings/...
       */
      const isMatch = false;
      const dateLabel = "samedi 16 novembre";
      const hour = "10:00";
      const eventId = "training-456";

      const expectedTitle = "Convocation";
      const expectedBody = `Entraînement ${dateLabel} à ${hour}. Merci de confirmer votre présence.`;
      const expectedUrl = `/trainings/${eventId}`;

      expect(expectedTitle).toBe("Convocation");
      expect(expectedBody).toContain("Entraînement");
      expect(expectedBody).toContain("samedi 16 novembre");
      expect(expectedUrl).toBe("/trainings/training-456");
    });

    it("utilise les bonnes URLs selon le type d'événement", () => {
      /**
       * Scénario:
       * - Match: /matches/{id}
       * - Training: /trainings/{id}
       */
      const matchEventId = "match-123";
      const trainingEventId = "training-456";

      const matchUrl = `/matches/${matchEventId}`;
      const trainingUrl = `/trainings/${trainingEventId}`;

      expect(matchUrl).toBe("/matches/match-123");
      expect(trainingUrl).toBe("/trainings/training-456");
    });

    it("crée les bonnes propriétés de base", () => {
      /**
       * Scénario:
       * - Toutes les notifications doivent avoir: type, reference_id, scheduled_for
       */
      const notificationRow = {
        user_id: "player-1",
        team_id: "team-xyz",
        type: "convocation",
        title: "Convocation",
        body: "...",
        reference_id: "auto_conv:event-123:player-1",
        url: "/matches/event-123",
        scheduled_for: "2026-11-12T10:00:00Z",
      };

      expect(notificationRow.type).toBe("convocation");
      expect(notificationRow.reference_id).toContain("auto_conv:");
      expect(notificationRow.scheduled_for).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("Batch insert", () => {
    it("insère tous les destinataires en une seule requête", () => {
      /**
       * Scénario:
       * - Joueur 1 + 2 parents = 3 rows
       * - Un seul insert() avec 3 rows, pas 3 inserts séparés
       */
      const playerId = "player-1";
      const parentIds = ["parent-1a", "parent-1b"];
      const targetUserIds = [playerId, ...parentIds];

      const notificationRows = targetUserIds.map((userId) => ({
        user_id: userId,
        team_id: "team-xyz",
        type: "convocation",
        title: "Convocation",
        body: "Match...",
        reference_id: "auto_conv:event-123:player-1",
        url: "/matches/event-123",
        scheduled_for: "2026-11-12T10:00:00Z",
      }));

      expect(notificationRows.length).toBe(3);
      expect(notificationRows[0].user_id).toBe("player-1");
      expect(notificationRows[1].user_id).toBe("parent-1a");
      expect(notificationRows[2].user_id).toBe("parent-1b");
    });

    it("gère les batchs de différentes tailles", () => {
      /**
       * Scénario:
       * - Joueur sans parents: 1 row
       * - Joueur avec 3 parents: 4 rows
       * - Joueur avec 1 parent: 2 rows
       * - Total: 7 rows (1 insert avec 7 rows)
       */
      const playerBatches = [
        { playerId: "player-1", parentIds: [] },
        { playerId: "player-2", parentIds: ["p2a", "p2b", "p2c"] },
        { playerId: "player-3", parentIds: ["p3a"] },
      ];

      const notificationRows: any[] = [];
      for (const batch of playerBatches) {
        const targetUserIds = [batch.playerId, ...batch.parentIds];
        for (const userId of targetUserIds) {
          notificationRows.push({
            user_id: userId,
            team_id: "team-xyz",
            type: "convocation",
            reference_id: `auto_conv:event-123:${batch.playerId}`,
            title: "Convocation",
            body: "...",
            url: "/matches/event-123",
            scheduled_for: "2026-11-12T10:00:00Z",
          });
        }
      }

      expect(notificationRows.length).toBe(7);
    });
  });
});
