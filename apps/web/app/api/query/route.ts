import { checkMessageLimit } from "@/lib/limits";
import {
  QUERY_TIMEOUT_MS,
  callRagService,
  serviceErrorResponse,
} from "@/lib/rag-service";
import { requireUser } from "@/lib/supabase/require-user";
import { addMessageUsage } from "@/lib/usage";

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) {
    return user;
  }

  let repoId: unknown;
  let question: unknown;

  try {
    ({ repoId, question } = await request.json());
  } catch {
    return Response.json(
      { error: "invalid_body", message: "O corpo do pedido não é JSON válido." },
      { status: 400 }
    );
  }

  if (typeof repoId !== "string" || typeof question !== "string" || question.trim() === "") {
    return Response.json(
      { error: "invalid_query", message: "Faltam os campos repoId e question." },
      { status: 400 }
    );
  }

  const limit = await checkMessageLimit();

  if (limit) {
    return Response.json(limit, { status: 402 });
  }

  await addMessageUsage(user.id);

  try {
    // O abort do browser é propagado de propósito: a resposta gerada não é guardada
    // em lado nenhum, por isso continuar a gerar depois de o separador fechar era só
    // pagar tokens ao Gemini para os escrever num socket fechado. Quando a Fase 3
    // persistir o histórico de mensagens, isto passa a fazer sentido ao contrário —
    // deixar acabar e gravar — e a mudança é não passar aqui o clientSignal.
    const upstream = await callRagService("/query", {
      body: { repo_id: repoId, question: question.trim(), user_id: user.id },
      timeoutMs: QUERY_TIMEOUT_MS,
      clientSignal: request.signal,
    });

    // O retrieval corre antes de o stream abrir, por isso um erro aqui ainda chega
    // como JSON normal e é reencaminhado como JSON (repo_not_indexed, 401, etc.).
    if (!upstream.ok || !upstream.body) {
      return Response.json(await upstream.json(), { status: upstream.status });
    }

    // O ponto todo da Fase 2: `upstream.body` já é um ReadableStream e é devolvido
    // sem ser lido. Qualquer await ao corpo aqui (`.text()`, `.json()`) daria a
    // mesma resposta final ao utilizador, mas só depois de o Gemini ter acabado.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        // O Next atrás de um proxy (Vercel, nginx) pode bufferizar SSE; este header
        // é o sinal convencional para não o fazer.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
