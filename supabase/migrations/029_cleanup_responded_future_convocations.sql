-- Les convocations doivent démarrer convocation_lead_days jours avant l'événement.
-- Nettoyage complémentaire : supprime aussi les lignes d'attendance déjà RÉPONDUES
-- (status != pending) pour les événements dont la convocation n'a jamais été envoyée
-- et dont la fenêtre de convocation n'est pas encore ouverte.
-- Elles seront recréées à l'envoi réel de la notification.
DELETE FROM attendances a
USING events e
WHERE a.event_id = e.id
  AND e.convocations_sent_at IS NULL
  AND e.event_date - make_interval(days => COALESCE(e.convocation_lead_days, 3)) > now();
