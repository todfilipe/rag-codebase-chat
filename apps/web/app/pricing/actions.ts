"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { getOrCreateCustomerId } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function startCheckout(formData: FormData) {
  const planId = formData.get("plan_id");

  if (typeof planId !== "string") {
    throw new Error("plan_id em falta no formulário.");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL em falta no .env.local");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: plan, error } = await supabase
    .from("plans")
    .select("stripe_price_id")
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha a ler o plano: ${error.message}`);
  }

  if (!plan || !plan.stripe_price_id) {
    throw new Error(`O plano ${planId} não existe ou não é pago.`);
  }

  const customerId = await getOrCreateCustomerId(user.id, user.email);

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${siteUrl}/dashboard?checkout=success`,
    cancel_url: `${siteUrl}/pricing`,
  });

  if (!session.url) {
    throw new Error("O Stripe não devolveu um URL de checkout.");
  }

  redirect(session.url);
}
