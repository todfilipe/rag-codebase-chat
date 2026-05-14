import { generateEmbedding } from "@/lib/gemini";

// Diagnóstico: valida pipeline com a Gemini. Apagar quando o indexer estiver pronto.
export async function GET() {
  try {
    const embedding = await generateEmbedding("hello world");
    return Response.json({ length: embedding.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return Response.json({ error: message }, { status: 500 });
  }
}
