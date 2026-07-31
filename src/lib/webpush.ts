import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  console.error(
    "[webpush] Missing VAPID env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT"
  );
} else if (VAPID_PRIVATE_KEY.length < 40 || VAPID_PUBLIC_KEY.length < 80) {
  console.error(
    "[webpush] VAPID env vars look invalid (private ~43 chars, public ~87 chars base64url). " +
      "Fix the values in Vercel and redeploy, otherwise push sends will fail."
  );
}

webpush.setVapidDetails(
  VAPID_SUBJECT || "mailto:support@sportplus.app",
  VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY || ""
);

export default webpush;
