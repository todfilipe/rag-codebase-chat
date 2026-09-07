import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";

export type Usage = {
  messages: number;
  chunks: number;
};

export function currentMonth(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `${now.getUTCFullYear()}-${month}-01`;
}

export async function getMyUsage(): Promise<Usage> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("usage_monthly")
    .select("messages,chunks")
    .eq("month", currentMonth())
    .maybeSingle();

  if (error) {
    throw new Error(`Falha a ler o uso do mês: ${error.message}`);
  }

  return data ?? { messages: 0, chunks: 0 };
}

export async function countMyRepos(): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("repos")
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(`Falha a contar os repositórios: ${error.message}`);
  }

  return count ?? 0;
}

export async function hasRepo(owner: string, repo: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("repos")
    .select("id")
    .eq("owner", owner)
    .eq("repo", repo)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha a procurar o repositório: ${error.message}`);
  }

  return data !== null;
}

export async function addMessageUsage(userId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.rpc("add_usage", {
    usage_user_id: userId,
    extra_messages: 1,
    extra_chunks: 0,
  });

  if (error) {
    throw new Error(`Falha a gravar o uso: ${error.message}`);
  }
}
