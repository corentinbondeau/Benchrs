import webpush from "web-push";

// Keypair VAPID intégré (matches the client key in src/lib/push.ts). On ignore
// délibérément les clés d'env Vercel : elles ont été observées vides/stub et une
// paire env partiellement valide provoquait un mismatch VAPID (push refusé).
// Client et serveur utilisent TOUJOURS cette même paire → livraison garantie.
const FALLBACK_VAPID_PUBLIC_KEY =
  "BKp6frQFz94B7dpWC7WlId_rxF1f_7DNJUhSjX1h5wVbMLuxzSR8VHTAaalGdXHf20_CzQ91lez1CkWnFkCczoU";
const FALLBACK_VAPID_PRIVATE_KEY =
  "4gko0s1AdJPAoCpXTxzJ3rQE9vs1bO2lf-4N6IFLHoc";

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@benchrs.app";

webpush.setVapidDetails(VAPID_SUBJECT, FALLBACK_VAPID_PUBLIC_KEY, FALLBACK_VAPID_PRIVATE_KEY);

export default webpush;
