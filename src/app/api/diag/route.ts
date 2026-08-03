import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function decodePayload(jwt?: string) {
  if (!jwt) return null;
  try {
    const part = jwt.split(".")[1];
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  } catch {
    return null;
  }
}

export async function GET() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const payload = decodePayload(key);
  const { data, error } = await createAdminClient().auth.getUser(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );
  return NextResponse.json({
    keyLength: key?.length ?? 0,
    keyRole: payload?.role ?? null,
    keyRef: payload?.ref ?? null,
    keyExp: payload?.exp ?? null,
    getUserError: error?.message ?? null,
    getUserOk: !!data?.user,
  });
}
