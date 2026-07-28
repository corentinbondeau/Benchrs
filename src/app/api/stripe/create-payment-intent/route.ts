import { NextResponse } from "next/server";
import Stripe from "stripe";

let stripe: Stripe | null = null;
function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripe;
}

export async function POST(req: Request) {
  try {
    const { cotisation_id, amount, player_name, description } = await req.json();
    if (!cotisation_id || !amount || amount <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "eur",
      metadata: { cotisation_id },
      description: description || `Cotisation ${player_name || ""}`.trim(),
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Stripe create-payment-intent error:", err);
    return NextResponse.json({ error: "Erreur de paiement" }, { status: 500 });
  }
}
