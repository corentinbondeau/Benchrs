import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = createAdminClient();

    const { data: buckets } = await supabase.storage.listBuckets();
    if (buckets?.find((b) => b.name === "gallery")) {
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.storage.createBucket("gallery", {
      public: true,
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
