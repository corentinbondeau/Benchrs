import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { renderEmergencyBookPdf } from "@/lib/export/emergencyBookPdf";
import { fffCategoryFromBirthDate } from "@/lib/vmaNorms";

export const dynamic = "force-dynamic";

type EmergencyContact = { name?: string; phone?: string; relation?: string };

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized("unauthorized");

  if (!rateLimit(`club-emergency-book:${clientKey(req)}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const eventId = body?.eventId as string | undefined;
  if (!eventId) {
    return NextResponse.json({ error: "eventId requis" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, team_id, type, title, event_date, location")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });

  const teamId = (event as { team_id: string }).team_id;

  // Validateur : comité du club de l'équipe uniquement (PII téléphones/allergies).
  const [{ data: team }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, club_id")
      .eq("id", teamId)
      .maybeSingle(),
  ]);
  const clubId = (team as { club_id: string | null } | null)?.club_id ?? null;

  let isCommittee = false;
  if (clubId) {
    const { data: membership } = await supabase
      .from("club_members")
      .select("id")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .eq("role", "comite")
      .maybeSingle();
    isCommittee = !!membership;
  }
  if (!isCommittee) {
    return NextResponse.json(
      { error: "Réservé au comité du club" },
      { status: 403 }
    );
  }

  // Joueurs convoqués et présents (plus les parents qui les couvrent).
  const { data: attendances } = await supabase
    .from("attendances")
    .select("user_id")
    .eq("event_id", eventId)
    .in("status", ["present", "late"]);

  const playerIds = ((attendances || []) as { user_id: string }[]).map((a) => a.user_id);
  const { data: profiles } =
    playerIds.length > 0
      ? await supabase
          .from("profiles")
          .select(
            "id, first_name, last_name, date_of_birth, phone, allergies, emergency_contacts, medical_cert_expires_at"
          )
          .in("id", playerIds)
      : { data: [] };

  const players = ((profiles || []) as (EmergencyBookPlayerRow)[])
    .map((p) => {
      const contacts = (Array.isArray(p.emergency_contacts)
        ? p.emergency_contacts
        : []) as EmergencyContact[];
      const first = contacts[0];
      return {
        lastName: p.last_name || "",
        firstName: p.first_name || "",
        birthDate: p.date_of_birth
          ? new Date(p.date_of_birth).toLocaleDateString("fr-FR")
          : null,
        category: fffCategoryFromBirthDate(p.date_of_birth),
        phone: p.phone || null,
        allergies: p.allergies || null,
        emergencyContact: first
          ? `${first.name || "Contact"}${first.phone ? ` · ${first.phone}` : ""}`
          : null,
        medicalCertExpiresAt: p.medical_cert_expires_at
          ? new Date(p.medical_cert_expires_at).toLocaleDateString("fr-FR")
          : null,
      };
    })
    .sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr")
    );

  try {
    const pdfBuffer = await renderEmergencyBookPdf({
      clubName: (team as { name: string } | null)?.name ?? "Club",
      teamName: (team as { name: string } | null)?.name ?? "Équipe",
      eventLabel:
        (event as { type: string }).type === "match"
          ? `Match · ${(event as { title?: string }).title ?? ""}`
          : (event as { title?: string }).title ?? "Événement",
      eventDate: (event as { event_date: string | null }).event_date
        ? new Date((event as { event_date: string }).event_date).toLocaleDateString("fr-FR")
        : null,
      generatedAt: new Date().toLocaleString("fr-FR"),
      players,
    });

    return NextResponse.json({
      pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    });
  } catch (e) {
    console.error("[clubs/emergency-book] échec:", e);
    return NextResponse.json(
      { error: "Erreur lors de la génération du cahier des urgences" },
      { status: 500 }
    );
  }
}

type EmergencyBookPlayerRow = {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  allergies: string | null;
  emergency_contacts: unknown;
  medical_cert_expires_at: string | null;
};