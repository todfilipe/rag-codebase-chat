const CHUNK_SIZE = 2000;
const OVERLAP = 200;
// Avançar STEP faz os últimos OVERLAP chars de um chunk repetirem-se nos primeiros do seguinte.
const STEP = CHUNK_SIZE - OVERLAP;

export type Chunk = {
  content: string;
  start: number;
  end: number;
};

export function chunkText(text: string): Chunk[] {
  if (text.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];

  for (let start = 0; start < text.length; start += STEP) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push({
      content: text.slice(start, end),
      start,
      end,
    });

    // Sem este break, iterações finais produziriam chunks só com overlap.
    if (end === text.length) {
      break;
    }
  }

  return chunks;
}
