import webpush from "web-push";

// Fallback VAPID pair (matches the client fallback in src/lib/push.ts) so push
// delivery keeps working even when the Vercel env vars are missing/stubbed.
// Real env values, when present, take precedence.
const FALLBACK_VAPID_PUBLIC_KEY =
  "BKp6frQFz94B7dpWC7WlId_rxF1f_7DNJUhSjX1h5wVbMLuxzSR8VHTAaalGdXHf20_CzQ91lez1CkWnFkCczoU";
const FALLBACK_VAPID_PRIVATE_KEY =
  "4gko0s1AdJPAoCpXTxzJ3rQE9vs1bO2lf-4N6IFLHoc";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || FALLBACK_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || FALLBACK_VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@sportplus.app";

if (process.env.VAPID_PRIVATE_KEY && process.env.VAPID_PRIVATE_KEY.length < 40) {
  console.error(
    "[webpush] VAPID_PRIVATE_KEY looks invalid (expected ~43 chars base64url). " +
      "Falling back to the built-in keypair — make sure the client subscribes with the matching public key."
  );
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export default webpush;
