-- Prevent double voting: one vote per voter per session
ALTER TABLE motm_votes
  ADD CONSTRAINT motm_votes_event_voter_unique UNIQUE (event_id, voter_id);
