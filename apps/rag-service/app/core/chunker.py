from bisect import bisect_left
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
    start_line: int
    end_line: int


def chunk_text(text: str) -> list[Chunk]:
    # As linhas só se conseguem calcular aqui, com o ficheiro inteiro à mão: o
    # start em caracteres é inútil para o GitHub, que só entende #L120-L160, e
    # depois de cortado o chunk já não há texto anterior para contar os \n.
    newlines = [offset for offset, char in enumerate(text) if char == "\n"]

    def line_at(offset: int) -> int:
        # Quantos \n ficaram para trás, +1 porque as linhas contam-se de 1.
        return bisect_left(newlines, offset) + 1

    chunks: list[Chunk] = []

    for start in range(0, len(text), STEP):
        end = min(start + CHUNK_SIZE, len(text))
        chunks.append(
            Chunk(
                content=text[start:end],
                start=start,
                end=end,
                start_line=line_at(start),
                # end é exclusivo; a linha que interessa é a do último caractere
                # incluído, senão um chunk que acaba mesmo num \n reclamava a
                # linha seguinte, onde não tem uma única letra.
                end_line=line_at(end - 1),
            )
        )

        # Sem este break, iterações finais produziriam chunks só com overlap.
        if end == len(text):
            break

    return chunks
