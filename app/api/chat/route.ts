import { RagServiceError, askQuestion } from "@/lib/rag-client";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo do pedido não é JSON válido" }, { status: 400 });
  }

  const fields = (body ?? {}) as { question?: unknown; repoId?: unknown; k?: unknown };

  if (typeof fields.question !== "string" || fields.question.trim() === "") {
    return Response.json({ error: "Campo obrigatório em falta: question" }, { status: 400 });
  }

  if (typeof fields.repoId !== "string" || fields.repoId.trim() === "") {
    return Response.json({ error: "Campo obrigatório em falta: repoId" }, { status: 400 });
  }

  if (fields.k !== undefined && (typeof fields.k !== "number" || !Number.isInteger(fields.k))) {
    return Response.json({ error: "k tem de ser um inteiro" }, { status: 400 });
  }

  try {
    const result = await askQuestion(fields.question.trim(), fields.repoId, fields.k);
    return Response.json(result);
  } catch (error) {
    if (error instanceof RagServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
