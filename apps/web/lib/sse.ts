// Parser de SSE à mão porque o EventSource do browser só faz GET, e o /api/query
// é um POST com a pergunta no body. Perde-se o parsing de borla, ganha-se poder
// abortar o stream quando o utilizador sai da página.

export type SseEvent = { event: string; data: string };

/** Lê o corpo da resposta aos pedaços e devolve um evento de cada vez, à medida
 * que chegam. */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  // O que sai de cada read() são bytes cortados por tamanho de pedaço de rede,
  // não eventos: um read pode trazer dois eventos e meio, e o meio que sobra só
  // fica completo no read seguinte. É esse resto que vive aqui.
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // stream: true pelo mesmo motivo do buffer, um nível abaixo: um caractere
      // UTF-8 pode ficar partido entre dois pedaços, e sem isto virava "".
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const parsed = parseFrame(frame);
        if (parsed) yield parsed;

        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  // Frames sem data são comentários de keep-alive; o rag-service não manda
  // nenhum, mas ignorá-los é uma linha e evita um JSON.parse("").
  if (dataLines.length === 0) return null;

  return { event, data: dataLines.join("\n") };
}
