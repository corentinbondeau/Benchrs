import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

let stripe: Stripe | null = null;
function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripe;
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const cotisation_id = pi.metadata.cotisation_id;
    const amount = pi.amount / 100;

    if (!cotisation_id) {
      return NextResponse.json({ error: "Missing cotisation_id" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: cotisation } = await supabase
      .from("cotisations")
      .select("*")
      .eq("id", cotisation_id)
      .single();

    if (!cotisation) {
      return NextResponse.json({ error: "Cotisation not found" }, { status: 404 });
    }

    const newPaid = Number(cotisation.amount_paid) + amount;
    const expected = Number(cotisation.amount_expected);
    const newStatus = newPaid >= expected ? "paid" : newPaid > 0 ? "partial" : "pending";

    await supabase.from("payment_history").insert({
      cotisation_id,
      amount,
      payment_method: "Carte bancaire",
      payment_date: new Date().toISOString().slice(0, 10),
      stripe_payment_intent_id: pi.id,
      team_id: cotisation.team_id,
    });

    await supabase
      .from("cotisations")
      .update({
        amount_paid: newPaid,
        status: newStatus,
        payment_method: "Carte bancaire",
        payment_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cotisation_id);
  }

  return NextResponse.json({ received: true });
}
