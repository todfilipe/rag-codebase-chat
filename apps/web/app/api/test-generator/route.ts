import { retrieveChunks } from "@/lib/retriever";
import { generateAnswer } from "@/lib/generator";

// Diagnóstico: pipeline RAG completo end-to-end. Pergunta + repoId -> retrieve + generate -> resposta + fontes.
// Apagar quando o endpoint real de chat estiver pronto.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const question = params.get("q");
  const repoId = params.get("repoId");

  if (!question || !repoId) {
    return Response.json(
      { error: "Passa ?q=...&repoId=... na query string" },
      { status: 400 }
    );
  }

  const startedAt = Date.now();

  try {
    const chunks = await retrieveChunks(question, repoId);
    const answer = await generateAnswer(question, chunks);

    return Response.json({
      question,
      answer,
      sources: chunks.map((c) => ({
        file_path: c.file_path,
        similarity: Number(c.similarity.toFixed(3)),
      })),
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return Response.json(
      { error: message, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
