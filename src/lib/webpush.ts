import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  console.error(
    "[webpush] Missing VAPID env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT"
  );
}

webpush.setVapidDetails(
  VAPID_SUBJECT || "mailto:support@sportplus.app",
  VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY || ""
);

export default webpush;
