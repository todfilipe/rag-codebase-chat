import {
  INDEX_TIMEOUT_MS,
  callRagService,
  serviceErrorResponse,
} from "@/lib/rag-service";

export async function POST(request: Request) {
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

  try {
    // Propagar o abort do browser aqui é seguro: este pedido só cobre a validação e
    // a listagem da árvore. A indexação em si já não vive nesta ligação — vive numa
    // task do rag-service, e sobrevive ao separador fechar.
    const upstream = await callRagService("/index", {
      body: { repo_url: repoUrl.trim(), user_id: null },
      timeoutMs: INDEX_TIMEOUT_MS,
      clientSignal: request.signal,
    });

    return Response.json(await upstream.json(), { status: upstream.status });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
