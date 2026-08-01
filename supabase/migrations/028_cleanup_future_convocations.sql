-- Les convocations doivent démarrer convocation_lead_days jours avant l'événement.
-- Nettoyage : supprime les lignes d'attendance créées en avance (ex. séries
-- récurrentes) pour des événements dont la convocation n'a jamais été envoyée
-- et n'est pas encore due. Elles seront recréées à l'envoi réel de la notification.
DELETE FROM attendances a
USING events e
WHERE a.event_id = e.id
  AND a.status = 'pending'
  AND e.convocations_sent_at IS NULL
  AND e.event_date - make_interval(days => COALESCE(e.convocation_lead_days, 3)) > now();
