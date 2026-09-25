import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const supabase = createAdminClient();

    const { data: buckets } = await supabase.storage.listBuckets();
    const existing = buckets?.find((b) => b.name === "match_videos");
    if (existing) {
      if (existing.public) {
        await supabase.storage.updateBucket("match_videos", { public: false });
      }
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.storage.createBucket("match_videos", {
      public: false,
      fileSizeLimit: 1073741824, // 1 Go
      allowedMimeTypes: ["video/*"],
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}