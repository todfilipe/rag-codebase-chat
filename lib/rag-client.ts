// Único ponto de contacto com o serviço Python. A partir daqui o Next.js não
// sabe nada sobre a Gemini, a GitHub ou o Supabase — só sobre este contrato.

export type IndexResult = {
  repo_id: string;
  files_indexed: number;
  chunks_created: number;
  duration_ms: number;
};

export type Source = {
  file_path: string;
  similarity: number;
  chunk_index: number;
};

export type ChatResult = {
  answer: string;
  sources: Source[];
  duration_ms: number;
};

// Erro com o status que o serviço devolveu, para as rotas o poderem reencaminhar
// em vez de transformarem tudo em 500.
export class RagServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RagServiceError";
  }
}

// Indexar um repo grande demora minutos: o timeout é generoso aqui e apertado
// nas chamadas individuais que o serviço faz às APIs externas.
const INDEX_TIMEOUT_MS = 15 * 60 * 1000;
const CHAT_TIMEOUT_MS = 60 * 1000;

function getServiceConfig(): { url: string; token: string } {
  const url = process.env.RAG_SERVICE_URL;
  const token = process.env.RAG_SERVICE_TOKEN;

  if (!url || !token) {
    throw new RagServiceError(
      "RAG_SERVICE_URL ou RAG_SERVICE_TOKEN não estão definidos no .env.local",
      500
    );
  }

  return { url: url.replace(/\/$/, ""), token };
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const { url, token } = getServiceConfig();

  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "erro desconhecido";
    throw new RagServiceError(`Serviço RAG inacessível: ${reason}`, 503);
  }

  if (!response.ok) {
    // O serviço responde sempre {"error": "..."}, mas um proxy pelo meio pode não o fazer.
    const fallback = `Serviço RAG respondeu ${response.status}`;
    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : fallback;
    throw new RagServiceError(message, response.status);
  }

  return (await response.json()) as T;
}

export function indexRepo(githubUrl: string): Promise<IndexResult> {
  return post<IndexResult>("/index", { github_url: githubUrl }, INDEX_TIMEOUT_MS);
}

export function askQuestion(
  question: string,
  repoId: string,
  k?: number
): Promise<ChatResult> {
  return post<ChatResult>(
    "/chat",
    k === undefined ? { question, repo_id: repoId } : { question, repo_id: repoId, k },
    CHAT_TIMEOUT_MS
  );
}
