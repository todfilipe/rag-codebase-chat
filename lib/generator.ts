import type { RetrievedChunk } from "./retriever";

const GENERATION_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_GENERATE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GENERATION_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = `És um assistente especializado em explicar código de um repositório GitHub.

Regras:
- Responde sempre com base nos excertos de código fornecidos pelo utilizador.
- Se a informação necessária não estiver nos excertos, diz claramente que não tens informação suficiente. Não inventes.
- Cita os ficheiros relevantes na resposta (apenas o caminho, ex: "ver \`src/index.js\`").
- Responde no idioma da pergunta do utilizador.
- Sê conciso. Não repitas a pergunta.`;

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

function buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
  const chunksSection = chunks
    .map((chunk) => `## Ficheiro: ${chunk.file_path}\n\n${chunk.content}`)
    .join("\n\n---\n\n");
  return `Excertos do repositório:\n\n${chunksSection}\n\nPergunta: ${question}`;
}

export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não está definida no .env.local");
  }

  const userPrompt = buildUserPrompt(question, chunks);

  const response = await fetch(GEMINI_GENERATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Gemini generate falhou (${response.status} ${response.statusText}): ${errorBody}`
    );
  }

  const data = (await response.json()) as GenerateContentResponse;
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!answer) {
    throw new Error("Resposta da Gemini vazia ou em formato inesperado");
  }

  return answer;
}
