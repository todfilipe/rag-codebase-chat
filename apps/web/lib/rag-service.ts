// Fronteira entre o browser e o rag-service. Nenhum Route Handler fala diretamente
// com o serviço Python: passam todos por aqui, para o token interno e o tratamento
// de falha de rede viverem num sítio só.

export type ServiceError = { error: string; message: string };

// Até o primeiro byte chegar. No /query isto cobre o retrieval inteiro (embedding da
// pergunta + match_chunks), porque o rag-service só devolve headers depois disso.
export const QUERY_TIMEOUT_MS = 30_000;

// O POST /index só faz o trabalho barato (validar o URL, listar a árvore) antes de
// responder 202 — a indexação a sério corre em background no rag-service. Por isso
// este timeout é curto: se demora mais do que isto, algo está mesmo mal.
export const INDEX_TIMEOUT_MS = 30_000;

export class RagServiceUnreachable extends Error {}
export class RagServiceTimeout extends Error {}

/** Chama o rag-service e devolve a Response crua — quem chama decide se lê o corpo
 * de uma vez (`/index`) ou se o passa adiante em streaming (`/query`). */
export async function callRagService(
  path: string,
  {
    method = "POST",
    body,
    timeoutMs,
    clientSignal,
  }: {
    method?: "GET" | "POST";
    body?: unknown;
    timeoutMs: number;
    clientSignal: AbortSignal;
  }
): Promise<Response> {
  const baseUrl = process.env.RAG_SERVICE_URL;
  const token = process.env.RAG_SERVICE_INTERNAL_TOKEN;

  if (!baseUrl || !token) {
    throw new Error(
      "RAG_SERVICE_URL ou RAG_SERVICE_INTERNAL_TOKEN em falta no .env.local"
    );
  }

  // Dois motivos distintos para abortar, um controller só: o utilizador fechou o
  // separador, ou o serviço demorou demasiado. Sem isto, fechar o separador deixava
  // o rag-service a gerar tokens do Gemini que ninguém ia ler.
  const controller = new AbortController();
  const abortFromClient = () => controller.abort(clientSignal.reason);
  clientSignal.addEventListener("abort", abortFromClient);

  const timeout = setTimeout(
    () => controller.abort(new RagServiceTimeout(`Sem resposta em ${timeoutMs}ms`)),
    timeoutMs
  );

  try {
    return await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.reason instanceof RagServiceTimeout) {
      throw controller.signal.reason;
    }
    // Se foi o cliente a desistir, deixa o AbortError subir: não é uma falha nossa
    // e não há ninguém do outro lado para receber a mensagem de erro.
    if (clientSignal.aborted) {
      throw error;
    }
    throw new RagServiceUnreachable(
      error instanceof Error ? error.message : "falha de rede desconhecida"
    );
  } finally {
    // O timer tem de morrer aqui e não no fim do stream: passado este ponto os
    // headers já chegaram, e abortar a meio de uma resposta longa era um bug.
    clearTimeout(timeout);
    clientSignal.removeEventListener("abort", abortFromClient);
  }
}

/** Traduz as falhas de fronteira em respostas para o browser. O contrato interno
 * (docs/API-CONTRACT.md) usa o shape {error, message}; mantém-se o mesmo aqui para
 * o frontend não ter de aprender dois formatos. */
export function serviceErrorResponse(error: unknown): Response {
  if (error instanceof RagServiceTimeout) {
    return Response.json(
      { error: "upstream_timeout", message: error.message } satisfies ServiceError,
      { status: 504 }
    );
  }

  if (error instanceof RagServiceUnreachable) {
    return Response.json(
      {
        error: "rag_service_unavailable",
        message: `Não foi possível contactar o rag-service: ${error.message}`,
      } satisfies ServiceError,
      { status: 502 }
    );
  }

  return Response.json(
    {
      error: "proxy_failed",
      message: error instanceof Error ? error.message : "erro desconhecido",
    } satisfies ServiceError,
    { status: 500 }
  );
}
