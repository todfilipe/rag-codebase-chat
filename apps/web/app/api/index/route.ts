import { parseGithubRepoUrl } from "@/lib/github-url";
import { checkRepoLimit } from "@/lib/limits";
import {
  INDEX_TIMEOUT_MS,
  callRagService,
  serviceErrorResponse,
} from "@/lib/rag-service";
import {
  INDEX_RATE_LIMIT,
  rateLimitedResponse,
  takeRateLimit,
} from "@/lib/rate-limit";
import { requireUser } from "@/lib/supabase/require-user";
import { hasRepo } from "@/lib/usage";

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) {
    return user;
  }

  const retryAfterSeconds = takeRateLimit(`index:${user.id}`, INDEX_RATE_LIMIT);
  if (retryAfterSeconds !== null) {
    return rateLimitedResponse(retryAfterSeconds);
  }

  let repoUrl: unknown;

  try {
    ({ repoUrl } = await request.json());
  } catch {
    return Response.json(
      { error: "invalid_body", message: "O corpo do pedido não é JSON válido." },
      { status: 400 }
    );
  }

  // Validação mínima, só para falhar depressa com uma mensagem útil. Quem valida a
  // sério é o rag-service: ele não pode assumir que o único chamador somos nós.
  if (typeof repoUrl !== "string" || repoUrl.trim() === "") {
    return Response.json(
      { error: "invalid_repo_url", message: "Falta o campo repoUrl." },
      { status: 400 }
    );
  }

  const parsed = parseGithubRepoUrl(repoUrl.trim());

  if (parsed) {
    const limit = await checkRepoLimit(
      !(await hasRepo(parsed.owner, parsed.repo))
    );

    if (limit) {
      return Response.json(limit, { status: 402 });
    }
  }

  try {
    // Propagar o abort do browser aqui é seguro: este pedido só cobre a validação e
    // a listagem da árvore. A indexação em si já não vive nesta ligação — vive numa
    // task do rag-service, e sobrevive ao separador fechar.
    const upstream = await callRagService("/index", {
      body: { repo_url: repoUrl.trim(), user_id: user.id },
      timeoutMs: INDEX_TIMEOUT_MS,
      clientSignal: request.signal,
    });

    return Response.json(await upstream.json(), { status: upstream.status });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
