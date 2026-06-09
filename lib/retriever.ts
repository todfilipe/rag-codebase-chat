import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "./gemini";

const DEFAULT_K = 5;

export type RetrievedChunk = {
  id: string;
  file_path: string;
  content: string;
  start_offset: number;
  end_offset: number;
  chunk_index: number;
  similarity: number;
};

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não estão definidos no .env.local"
    );
  }
  return createClient(url, key);
}

// Recebe uma pergunta em linguagem natural e devolve os top-k chunks do repo
// ordenados por similaridade decrescente. Encapsula geração do embedding da
// query + chamada à função SQL match_chunks via RPC.
export async function retrieveChunks(
  question: string,
  repoId: string,
  k: number = DEFAULT_K
): Promise<RetrievedChunk[]> {
  const supabase = getSupabaseClient();

  const queryEmbedding = await generateEmbedding(question);

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_repo_id: repoId,
    match_count: k,
  });

  if (error) {
    throw new Error(`Falha na função match_chunks: ${error.message}`);
  }

  return (data ?? []) as RetrievedChunk[];
}
