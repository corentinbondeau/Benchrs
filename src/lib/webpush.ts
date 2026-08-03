import webpush from "web-push";

// Fallback VAPID pair (matches the client fallback in src/lib/push.ts) so push
// delivery keeps working even when the Vercel env vars are missing/stubbed.
// Real env values, when present, take precedence.
const FALLBACK_VAPID_PUBLIC_KEY =
  "BKp6frQFz94B7dpWC7WlId_rxF1f_7DNJUhSjX1h5wVbMLuxzSR8VHTAaalGdXHf20_CzQ91lez1CkWnFkCczoU";
const FALLBACK_VAPID_PRIVATE_KEY =
  "4gko0s1AdJPAoCpXTxzJ3rQE9vs1bO2lf-4N6IFLHoc";

const envPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const envPrivate = process.env.VAPID_PRIVATE_KEY;
const validPublic =
  envPublic && envPublic.length >= 60 && !envPublic.includes("CHANGEME");
const validPrivate =
  envPrivate && envPrivate.length >= 40 && !envPrivate.includes("CHANGEME");

// Les valeurs d'env Vercel peuvent être des stubs vides/courts : on ne garde la
// paire d'env que si les DEUX clés sont valides, sinon on retombe sur le keypair
// intégré (qui matche le fallback client de src/lib/push.ts).
const useEnvPair = validPublic && validPrivate;
const VAPID_PUBLIC_KEY = useEnvPair ? envPublic! : FALLBACK_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = useEnvPair ? envPrivate! : FALLBACK_VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@benchrs.app";

if (!useEnvPair) {
  console.error(
    "[webpush] VAPID env keys invalid/stubbed — falling back to the built-in keypair. " +
      "Make sure the client subscribes with the matching public key (src/lib/push.ts)."
  );
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export default webpush;
