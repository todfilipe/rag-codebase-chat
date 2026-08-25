from dataclasses import dataclass


CHUNK_SIZE = 2000
OVERLAP = 200
# Avançar STEP faz os últimos OVERLAP chars de um chunk repetirem-se nos primeiros do seguinte.
STEP = CHUNK_SIZE - OVERLAP


@dataclass(frozen=True)
class Chunk:
    content: str
    start: int
    end: int


def chunk_text(text: str) -> list[Chunk]:
    chunks: list[Chunk] = []

    for start in range(0, len(text), STEP):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append(Chunk(content=text[start:end], start=start, end=end))

        # Sem este break, iterações finais produziriam chunks só com overlap.
        if end == len(text):
            break

    return chunks
