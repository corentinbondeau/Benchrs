import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized } from "@/lib/api-auth";

const BUCKET = "club_documents";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const supabase = createAdminClient();

    const { data: buckets } = await supabase.storage.listBuckets();
    const existing = buckets?.find((b) => b.name === BUCKET);
    if (existing) {
      if (existing.public) {
        await supabase.storage.updateBucket(BUCKET, { public: false });
      }
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 20971520,
      allowedMimeTypes: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/png",
        "image/jpeg",
      ],
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}