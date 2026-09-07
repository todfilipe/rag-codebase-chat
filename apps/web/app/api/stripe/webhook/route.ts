import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET em falta no .env.local");
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "bad_signature", message: "Header stripe-signature em falta." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json(
      { error: "bad_signature", message: "Assinatura do webhook inválida." },
      { status: 400 }
    );
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    await updateSubscription(event.data.object);
  }

  if (event.type === "customer.subscription.deleted") {
    await resetToFree(event.data.object);
  }

  return NextResponse.json({ received: true });
}

function getCustomerId(sub: Stripe.Subscription): string {
  if (typeof sub.customer === "string") {
    return sub.customer;
  }
  return sub.customer.id;
}

async function updateSubscription(sub: Stripe.Subscription) {
  const supabase = createSupabaseAdminClient();

  const item = sub.items.data[0];
  const priceId = item.price.id;

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id")
    .eq("stripe_price_id", priceId)
    .maybeSingle();

  if (planError) {
    throw new Error(`Falha a ler o plano: ${planError.message}`);
  }

  if (!plan) {
    throw new Error(`Nenhum plano com o stripe_price_id ${priceId}.`);
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({
      stripe_subscription_id: sub.id,
      plan_id: plan.id,
      status: sub.status,
      current_period_end: new Date(item.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", getCustomerId(sub));

  if (error) {
    throw new Error(`Falha a atualizar a subscrição: ${error.message}`);
  }
}

async function resetToFree(sub: Stripe.Subscription) {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("subscriptions")
    .update({
      stripe_subscription_id: null,
      plan_id: "free",
      status: "active",
      current_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", getCustomerId(sub))
    .eq("stripe_subscription_id", sub.id);

  if (error) {
    throw new Error(`Falha a atualizar a subscrição: ${error.message}`);
  }
}
