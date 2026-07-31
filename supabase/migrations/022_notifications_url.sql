-- Stocke l'URL de destination d'une notification pour que le clic sur une
-- notification push (relance, convocation...) ouvre directement la page de
-- l'événement (/trainings/[id] ou /matches/[id]) au lieu du calendrier.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS url TEXT;
