import type { IndexStage, ServiceError } from "./index-status";
import { createSupabaseServerClient } from "./supabase/server";

export type IndexedRepo = {
  id: string;
  owner: string;
  repo: string;
  url: string;
  index_stage: IndexStage;
  index_error: ServiceError | null;
  indexed_at: string;
};

export async function listIndexedRepos(): Promise<IndexedRepo[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("repos")
    .select("id,owner,repo,url,index_stage,index_error,indexed_at")
    .order("indexed_at", { ascending: false });

  if (error) {
    throw new Error(`Falha a ler os repositórios: ${error.message}`);
  }

  return data as IndexedRepo[];
}
