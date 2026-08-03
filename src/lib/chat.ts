import { createClient } from "@/lib/supabase/client";
import type { ChatChannel } from "@/types";

export function channelVisibleForRole(
  ch: Pick<ChatChannel, "channel_type">,
  role: string | undefined
): boolean {
  if (ch.channel_type === "general") return true;
  if (ch.channel_type === "parents") {
    return role === "parent" || role === "coach" || role === "owner";
  }
  if (ch.channel_type === "coaches") {
    return role === "coach" || role === "owner";
  }
  return false;
}

/**
 * Garantit une ligne chat_members pour chaque canal "implicite"
 * (général / parents / coachs) auquel l'utilisateur a droit par son rôle.
 * Ne touche pas aux lignes existantes (préserve left_at / last_read_at).
 */
export async function ensureChatMemberships(
  teamId: string,
  userId: string,
  role: string | undefined
): Promise<void> {
  if (!role) return;
  const supabase = createClient();
  const { data: channels } = await supabase
    .from("chat_channels")
    .select("id, channel_type")
    .eq("team_id", teamId);
  if (!channels) return;

  const implicit = channels.filter((c) =>
    channelVisibleForRole(c as ChatChannel, role)
  );
  if (implicit.length === 0) return;

  const { data: mine } = await supabase
    .from("chat_members")
    .select("channel_id")
    .eq("user_id", userId)
    .eq("team_id", teamId);
  const existing = new Set((mine || []).map((r) => r.channel_id));
  const missing = implicit.filter((c) => !existing.has(c.id));
  if (missing.length === 0) return;

  await supabase.from("chat_members").insert(
    missing.map((c) => ({
      channel_id: c.id,
      user_id: userId,
      team_id: teamId,
    }))
  );
}

/**
 * Destinataires des notifications d'un canal : membres actifs ayant les
 * notifications activées (par défaut pour ceux sans ligne chat_members).
 */
export async function fetchChannelRecipients(
  channel: ChatChannel,
  teamId: string
): Promise<string[]> {
  const supabase = createClient();

  if (channel.channel_type === "custom") {
    const { data } = await supabase
      .from("chat_members")
      .select("user_id, notifications_enabled")
      .eq("team_id", teamId)
      .eq("channel_id", channel.id)
      .is("left_at", null);
    return ((data || []) as { user_id: string; notifications_enabled: boolean }[])
      .filter((r) => r.notifications_enabled)
      .map((r) => r.user_id);
  }

  const allowedRoles =
    channel.channel_type === "parents"
      ? ["parent", "coach", "owner"]
      : channel.channel_type === "coaches"
        ? ["coach", "owner"]
        : null;

  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", teamId);
  const { data: prefs } = await supabase
    .from("chat_members")
    .select("user_id, notifications_enabled, left_at")
    .eq("team_id", teamId)
    .eq("channel_id", channel.id);

  const prefMap = new Map(
    ((prefs || []) as {
      user_id: string;
      notifications_enabled: boolean;
      left_at: string | null;
    }[]).map((r) => [r.user_id, r])
  );

  const eligible = ((members || []) as { user_id: string; role: string }[])
    .filter((m) => (allowedRoles ? allowedRoles.includes(m.role) : true))
    .map((m) => m.user_id);

  return eligible.filter((uid) => {
    const p = prefMap.get(uid);
    if (!p) return true;
    if (p.left_at) return false;
    return p.notifications_enabled;
  });
}
