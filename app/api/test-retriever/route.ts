import { retrieveChunks } from "@/lib/retriever";

// Diagnóstico: testa o retriever com uma pergunta e um repo. Apagar quando o endpoint real de chat estiver pronto.
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

  try {
    const chunks = await retrieveChunks(question, repoId);

    return Response.json({
      question,
      repoId,
      count: chunks.length,
      results: chunks.map((c) => ({
        similarity: c.similarity,
        file_path: c.file_path,
        chunk_index: c.chunk_index,
        offsets: `${c.start_offset}-${c.end_offset}`,
        preview: c.content.slice(0, 200),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return Response.json({ error: message }, { status: 500 });
  }
}
