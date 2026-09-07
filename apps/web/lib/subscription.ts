import { getStripe } from "./stripe";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";

export type Subscription = {
  stripe_customer_id: string;
  plan_id: string;
  status: string;
};

export async function getMySubscription(): Promise<Subscription | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id,plan_id,status")
    .maybeSingle();

  if (error) {
    throw new Error(`Falha a ler a subscrição: ${error.message}`);
  }

  return data;
}

export async function getOrCreateCustomerId(
  userId: string,
  email: string | undefined
): Promise<string> {
  const supabase = createSupabaseAdminClient();

  const { data: subscription, error: readError } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw new Error(`Falha a ler a subscrição: ${readError.message}`);
  }

  if (subscription) {
    return subscription.stripe_customer_id;
  }

  const customer = await getStripe().customers.create(
    {
      email,
      metadata: { user_id: userId },
    },
    { idempotencyKey: `customer-${userId}` }
  );

  const { error: insertError } = await supabase
    .from("subscriptions")
    .insert({ user_id: userId, stripe_customer_id: customer.id });

  if (insertError) {
    throw new Error(`Falha a gravar a subscrição: ${insertError.message}`);
  }

  return customer.id;
}
