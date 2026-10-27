import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function capitalizeName(s: string) {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/(\s|-|')/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

export async function POST() {
  try {
    const admin = createAdminClient();
    const { data: profiles } = await admin.from("profiles").select("id, first_name, last_name");
    if (!profiles) return NextResponse.json({ ok: true, count: 0 });
    
    let count = 0;
    for (const p of profiles as any[]) {
      const fn = capitalizeName(p.first_name || "");
      const ln = capitalizeName(p.last_name || "");
      if (fn !== p.first_name || ln !== p.last_name) {
        await admin.from("profiles").update({ first_name: fn, last_name: ln }).eq("id", p.id);
        count++;
      }
    }
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
