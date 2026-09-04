import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, isTeamCoach, unauthorized, forbidden } from "@/lib/api-auth";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const meetingId = formData.get("meetingId") as string | null;
  const teamId = formData.get("teamId") as string | null;

  if (!file || !meetingId || !teamId) {
    return NextResponse.json({ error: "Fichier, meetingId et teamId requis" }, { status: 400 });
  }

  if (!await isTeamCoach(user.id, teamId)) {
    return forbidden();
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Le fichier ne doit pas dépasser 10 Mo" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // S'assurer que le bucket 'documents' existe
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === "documents")) {
    await supabase.storage.createBucket("documents", {
      public: true,
      fileSizeLimit: 10485760, // 10 Mo
      allowedMimeTypes: ["application/pdf"],
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `meetings/${teamId}/${meetingId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: `Upload échoué : ${uploadError.message}` }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("parent_meetings")
    .update({ report_pdf_url: publicUrl })
    .eq("id", meetingId);

  if (updateError) {
    return NextResponse.json({ error: `Enregistrement échoué : ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}
