import { createClient } from "@supabase/supabase-js";
import { chunkText } from "./chunker";
import { generateEmbedding } from "./gemini";
import {
  parseGithubUrl,
  listRepoFiles,
  fetchFileContent,
  shouldIndexFile,
} from "./github";

// Concorrência para chamadas paralelas. Limitado a 5 para respeitar o RPM
// da Gemini (100 req/min) com folga para latência variável.
const CONCURRENCY = 5;

export type IndexResult = {
  repoId: string;
  filesIndexed: number;
  chunksCreated: number;
};

type ChunkRow = {
  repo_id: string;
  file_path: string;
  content: string;
  start_offset: number;
  end_offset: number;
  chunk_index: number;
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

export async function indexRepo(githubUrl: string): Promise<IndexResult> {
  const supabase = getSupabaseClient();
  const { owner, repo } = parseGithubUrl(githubUrl);

  // Upsert do repo. Cria a linha se for primeira indexação, devolve o UUID nos dois casos.
  const { data: repoData, error: repoError } = await supabase
    .from("repos")
    .upsert(
      { owner, repo, url: githubUrl },
      { onConflict: "owner,repo" }
    )
    .select("id")
    .single();
  if (repoError || !repoData) {
    throw new Error(`Falha a upsert repo: ${repoError?.message}`);
  }
  const repoId = repoData.id as string;

  // Clean slate. Apagar chunks antigos. ON DELETE CASCADE não dispara aqui porque o repo não é apagado.
  const { error: deleteError } = await supabase
    .from("code_chunks")
    .delete()
    .eq("repo_id", repoId);
  if (deleteError) {
    throw new Error(`Falha a limpar chunks antigos: ${deleteError.message}`);
  }

  const allFiles = await listRepoFiles(owner, repo);
  const indexableFiles = allFiles.filter(shouldIndexFile);

  // Fase 1: ler ficheiros e chunkar, em pool de CONCURRENCY. Reads são bloqueantes (latência GitHub).
  const chunkRows: ChunkRow[] = [];
  for (let i = 0; i < indexableFiles.length; i += CONCURRENCY) {
    const batch = indexableFiles.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (file) => {
        const content = await fetchFileContent(owner, repo, file.sha);
        return { file, chunks: chunkText(content) };
      })
    );
    for (const { file, chunks } of results) {
      chunks.forEach((chunk, idx) => {
        chunkRows.push({
          repo_id: repoId,
          file_path: file.path,
          content: chunk.content,
          start_offset: chunk.start,
          end_offset: chunk.end,
          chunk_index: idx,
        });
      });
    }
  }

  // Fase 2: gerar embeddings em pool de CONCURRENCY e inserir cada batch como uma só linha de INSERT.
  for (let i = 0; i < chunkRows.length; i += CONCURRENCY) {
    const batch = chunkRows.slice(i, i + CONCURRENCY);
    const enriched = await Promise.all(
      batch.map(async (row) => ({
        ...row,
        embedding: await generateEmbedding(row.content),
      }))
    );
    const { error } = await supabase.from("code_chunks").insert(enriched);
    if (error) {
      throw new Error(`Falha a inserir batch de chunks: ${error.message}`);
    }
  }

  return {
    repoId,
    filesIndexed: indexableFiles.length,
    chunksCreated: chunkRows.length,
  };
}
