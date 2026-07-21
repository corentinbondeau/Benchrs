import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const eventId = formData.get("eventId") as string | null;
  const caption = formData.get("caption") as string | null;

  if (!file) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Type de fichier non supporté (images et vidéos uniquement)" },
      { status: 400 }
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Le fichier ne doit pas dépasser 10 Mo" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const ext = file.name.split(".").pop() || "jpg";
  const filePath = `gallery/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("gallery")
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("gallery")
    .getPublicUrl(filePath);

  const mediaType = file.type.startsWith("video/") ? "video" : "image";

  const { data: media, error: insertError } = await supabase
    .from("gallery_media")
    .insert({
      event_id: eventId || null,
      uploaded_by: session.user.id,
      url: urlData.publicUrl,
      media_type: mediaType,
      caption: caption || null,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ media });
}
