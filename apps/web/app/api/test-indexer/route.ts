import { indexRepo } from "@/lib/indexer";

// Diagnóstico: corre o pipeline completo num repo real. Apagar quando o endpoint de indexação real estiver pronto.
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");

  if (!url) {
    return Response.json(
      { error: "Passa o parâmetro ?url=... na query string" },
      { status: 400 }
    );
  }

  const startedAt = Date.now();

  try {
    const result = await indexRepo(url);
    return Response.json({
      ...result,
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
