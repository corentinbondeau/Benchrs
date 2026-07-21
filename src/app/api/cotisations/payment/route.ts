import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth/config";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cotisationId = searchParams.get("cotisation_id");

  if (!cotisationId) {
    return NextResponse.json({ error: "cotisation_id requis" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payment_history")
    .select("*, recorded_by_user:profiles!payment_history_recorded_by_fkey(first_name, last_name)")
    .eq("cotisation_id", cotisationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const body = await request.json();
  const { cotisation_id, amount, payment_method, notes } = body;

  if (!cotisation_id || !amount || amount <= 0) {
    return NextResponse.json({ error: "cotisation_id et amount (>0) requis" }, { status: 400 });
  }

  const supabase = await createClient();

  // Record the payment
  const { error: insertError } = await supabase.from("payment_history").insert({
    cotisation_id,
    amount,
    payment_method: payment_method || null,
    payment_date: new Date().toISOString().split("T")[0],
    recorded_by: session.user.id,
    notes: notes || null,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Update the cotisation's total paid
  const { data: cotisation } = await supabase
    .from("cotisations")
    .select("amount_expected, amount_paid")
    .eq("id", cotisation_id)
    .single();

  if (cotisation) {
    const newTotal = (cotisation.amount_paid || 0) + amount;
    const newStatus = newTotal >= cotisation.amount_expected ? "paid" : "partial";

    await supabase
      .from("cotisations")
      .update({
        amount_paid: newTotal,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cotisation_id);
  }

  return NextResponse.json({ success: true });
}
