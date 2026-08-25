import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const supabase = createAdminClient();

    const { data: buckets } = await supabase.storage.listBuckets();
    const existing = buckets?.find((b) => b.name === "gallery");
    if (existing) {
      if (existing.public) {
        await supabase.storage.updateBucket("gallery", { public: false });
      }
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.storage.createBucket("gallery", {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ["image/*", "video/*"],
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
