const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 768;

// Default da API é 3072. Forçar 768 para bater com a coluna `embedding` em code_chunks.
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

type EmbedContentResponse = {
  embedding: {
    values: number[];
  };
};

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não está definida no .env.local");
  }

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Gemini embedding falhou (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const data = (await response.json()) as EmbedContentResponse;
  const vector = data.embedding?.values;

  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Esperava vetor de ${EMBEDDING_DIMENSIONS} dimensões, recebi ${vector?.length ?? "nada"}`
    );
  }

  return vector;
}
