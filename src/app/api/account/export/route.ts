import { NextResponse } from "next/server";
import { getAuthUserDetailed, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Collection {
  table: string;
  columns?: string;
  filters: Array<[string, string]>;
}

// Tables liées au compte, avec leur colonne d'appartenance (user_id, player_id, etc.)
const COLLECTIONS: Collection[] = [
  { table: "profiles", columns: "id, role, first_name, last_name, avatar_url, phone, date_of_birth, position, shirt_number, is_active, created_at", filters: [["id", "user"]] },
  { table: "team_members", filters: [["user_id", "user"]] },
  { table: "parent_student", filters: [["parent_id", "user"], ["student_id", "user"]] },
  { table: "notifications", filters: [["user_id", "user"]] },
  { table: "notification_preferences", filters: [["user_id", "user"]] },
  { table: "push_subscriptions", filters: [["user_id", "user"]] },
  { table: "match_ratings", filters: [["rater_id", "user"], ["player_id", "user"]] },
  { table: "match_player_ratings", filters: [["rater_id", "user"], ["player_id", "user"]] },
  { table: "motm_votes", filters: [["voter_id", "user"]] },
  { table: "attendances", filters: [["user_id", "user"]] },
  { table: "player_physical_tests", filters: [["player_id", "user"]] },
  { table: "personal_goals", filters: [["player_id", "user"]] },
  { table: "session_rpe", filters: [["player_id", "user"]] },
  { table: "challenge_submissions", filters: [["player_id", "user"]] },
  { table: "gallery_media", filters: [["uploaded_by", "user"]] },
  { table: "fitness_ratings", filters: [["user_id", "user"]] },
  { table: "injuries", filters: [["player_id", "user"], ["reported_by", "user"]] },
  { table: "cotisations", filters: [["player_id", "user"]] },
  { table: "payment_history", filters: [["recorded_by", "user"]] },
  { table: "item_loans", filters: [["player_id", "user"], ["created_by", "user"]] },
  { table: "inventory_items", filters: [["created_by", "user"]] },
  { table: "chat_members", filters: [["user_id", "user"]] },
  { table: "chat_messages", filters: [["user_id", "user"]] },
  { table: "poll_votes", filters: [["user_id", "user"]] },
  { table: "team_polls", filters: [["created_by", "user"]] },
  { table: "season_plans", filters: [["created_by", "user"]] },
  { table: "quarterly_reports", filters: [["created_by", "user"], ["player_id", "user"]] },
];

export async function GET(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const admin = createAdminClient();

  const data: Record<string, unknown[]> = {};

  const results = await Promise.all(
    COLLECTIONS.map(async (collection) => {
      const rows: unknown[] = [];
      for (const [column] of collection.filters) {
        const { data: res } = await admin
          .from(collection.table as "profiles")
          .select(collection.columns ?? "*")
          .eq(column, user.id);
        if (res) rows.push(...(res as unknown[]));
      }
      return { table: collection.table, rows };
    })
  );

  for (const { table, rows } of results) {
    const unique = new Map<string, unknown>();
    for (const row of rows as Array<{ id?: string }>) {
      if (row?.id) unique.set(row.id as string, row);
    }
    data[table] = Array.from(unique.values());
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
    },
    data,
  };

  return NextResponse.json(payload);
}
