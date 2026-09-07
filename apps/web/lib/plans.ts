import { getMySubscription } from "./subscription";
import { createSupabaseServerClient } from "./supabase/server";

export type Plan = {
  id: string;
  price_cents: number;
  stripe_price_id: string | null;
  max_repos: number;
  max_chunks_per_repo: number;
  max_messages_per_month: number;
  max_chunks_per_month: number;
};

export async function listPlans(): Promise<Plan[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .order("price_cents");

  if (error) {
    throw new Error(`Falha a ler os planos: ${error.message}`);
  }

  return data as Plan[];
}

const PAID_STATUSES = ["active", "trialing"];

export async function getMyPlan(): Promise<Plan> {
  const subscription = await getMySubscription();

  const planId =
    subscription && PAID_STATUSES.includes(subscription.status)
      ? subscription.plan_id
      : "free";

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha a ler o plano: ${error.message}`);
  }

  if (!data) {
    throw new Error(`O plano ${planId} não existe na tabela plans.`);
  }

  return data as Plan;
}
