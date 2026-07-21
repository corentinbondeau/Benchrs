import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { importEventsCSV, importAttendanceCSV } from "@/lib/sporteasy/csv-import";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const type = formData.get("type") as string | null;

  if (!file) {
    return NextResponse.json(
      { error: "Fichier CSV requis" },
      { status: 400 }
    );
  }

  if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
    return NextResponse.json(
      { error: "Le fichier doit être un CSV (.csv ou .txt)" },
      { status: 400 }
    );
  }

  const content = await file.text();

  if (content.length > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Le fichier ne doit pas dépasser 5 Mo" },
      { status: 400 }
    );
  }

  let result;
  if (type === "attendance") {
    result = await importAttendanceCSV(content);
  } else {
    result = await importEventsCSV(content);
  }

  return NextResponse.json({
    message: `${result.imported} enregistrement(s) importé(s)`,
    ...result,
  });
}
