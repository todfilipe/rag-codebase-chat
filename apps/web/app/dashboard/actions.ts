"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { getMySubscription } from "@/lib/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function openBillingPortal() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL em falta no .env.local");
  }

  const subscription = await getMySubscription();

  if (!subscription) {
    redirect("/pricing");
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${siteUrl}/dashboard`,
  });

  redirect(session.url);
}

export async function removeRepo(repoId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("repos").delete().eq("id", repoId);

  if (error) {
    return "Couldn't remove this repository. Try again.";
  }

  revalidatePath("/dashboard");
  return null;
}
