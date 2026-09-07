import type { ServiceError } from "./index-status";

// As mensagens que o rag-service devolve são para quem lê logs: trazem ids,
// status HTTP e, no caso de uma falha do Gemini, o JSON de erro inteiro. Estas
// são para quem está a olhar para o ecrã. Viviam duplicadas em cada componente
// que chamava a API, o que fazia com que o mesmo código de erro tivesse redações
// diferentes conforme o ecrã onde calhava aparecer.
export const ERROR_COPY: Record<string, string> = {
  // POST /index
  invalid_repo_url: "This doesn't look like a GitHub repository URL.",
  repo_not_found:
    "This repository is private or doesn't exist. Only public repositories are supported right now.",
  no_indexable_files: "This repository has no code files to index.",
  // Gravado em repos.index_error quando a indexação rebenta já em background.
  indexing_failed:
    "Indexing stopped before it finished. Trying again starts the repository over from scratch.",

  // GET /index/{repoId}/status
  status_unavailable: "Couldn't read the status of this indexing job.",

  // POST /query
  repo_not_indexed:
    "This repository has no indexed content. Try indexing it again.",
  retrieval_failed: "Couldn't search this repository. Try again in a moment.",
  generation_failed: "Something went wrong generating a response.",

  // Quotas do plano (lib/limits.ts e rag-service app/core/limits.py)
  repo_limit_reached:
    "You've used every repository slot on your plan. Remove one or upgrade to connect another.",
  message_limit_reached:
    "You've used every message on your plan this month. Upgrade for more, or wait for the counter to reset.",
  repo_too_large:
    "This repository is bigger than your plan allows. Upgrading raises the limit.",
  chunk_budget_exceeded:
    "This month's indexing budget is used up. Try again next month or upgrade your plan.",

  // Fronteira web → rag-service (lib/rag-service.ts)
  rag_service_unavailable:
    "The RAG service isn't responding. Check that rag-service is running.",
  upstream_timeout: "The RAG service took too long to respond.",
  invalid_internal_token: "The RAG service rejected this request.",
  rate_limited: "Rate limit reached. Try again in a minute.",
};

export const NETWORK_ERROR = "Couldn't reach the server. Check your connection.";

// Um código desconhecido cai na mensagem crua do serviço: é feia, mas um erro
// mudo era pior.
export function errorMessage(error: ServiceError): string {
  return ERROR_COPY[error.error] ?? error.message;
}

// A mensagem crua só vale a pena mostrar quando acrescenta alguma coisa à
// redação amigável (ex: o 429 de quota do Gemini diz qual é o limite).
export function errorDetail(error: ServiceError): string | null {
  return error.error in ERROR_COPY && error.message.trim() !== ""
    ? error.message
    : null;
}
