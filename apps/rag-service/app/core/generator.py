import json

import httpx

from app.core.embeddings import GeminiApiError
from app.core.retriever import RetrievedChunk


GENERATION_MODEL = "gemini-3.1-flash-lite-preview"

SYSTEM_INSTRUCTION = """És um assistente especializado em explicar código de um repositório GitHub.

Regras:
- Responde sempre com base nos excertos de código fornecidos pelo utilizador.
- Se a informação necessária não estiver nos excertos, diz claramente que não tens informação suficiente. Não inventes.
- Cita os ficheiros relevantes na resposta (apenas o caminho, ex: "ver `src/index.js`").
- Responde no idioma da pergunta do utilizador.
- Sê conciso. Não repitas a pergunta."""


def build_user_prompt(question: str, chunks: list[RetrievedChunk]) -> str:
    # O separador "---" e o cabeçalho por ficheiro existem para o modelo conseguir
    # dizer de onde veio cada coisa quando cita (decisão de 16-05-2026).
    chunks_section = "\n\n---\n\n".join(
        f"## Ficheiro: {chunk.file_path}\n\n{chunk.content}" for chunk in chunks
    )
    return f"Excertos do repositório:\n\n{chunks_section}\n\nPergunta: {question}"


async def generate_answer(
    gemini: httpx.AsyncClient, question: str, chunks: list[RetrievedChunk]
) -> str:
    response = await gemini.post(
        f"/models/{GENERATION_MODEL}:generateContent",
        json={
            "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": build_user_prompt(question, chunks)}],
                }
            ],
        },
        # Gerar demora mais do que embeddar; os 30s do cliente partilhado ficam curtos.
        timeout=60.0,
    )

    if response.status_code != 200:
        raise GeminiApiError(
            f"Gemini generate falhou ({response.status_code}): {response.text}"
        )

    candidates = response.json().get("candidates", [])
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []

    # Sem candidates o modelo bloqueou a resposta (safety, recitation); com parts
    # vazias devolveu conteúdo vazio. Nos dois casos não há nada para mostrar.
    if not parts or not parts[0].get("text"):
        raise GeminiApiError(f"Resposta da Gemini vazia ou inesperada: {response.text}")

    return parts[0]["text"]


async def stream_answer(
    gemini: httpx.AsyncClient, question: str, chunks: list[RetrievedChunk]
):
    """Mesma pergunta e mesmo prompt que o generate_answer, mas devolvendo o texto
    aos pedaços à medida que o Gemini o produz."""
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [
            {"role": "user", "parts": [{"text": build_user_prompt(question, chunks)}]}
        ],
    }

    # Sem o alt=sse o Gemini devolve um array JSON aos bocados, que obrigaria a
    # remendar os pedaços até dar um JSON válido. Com ele vem já em eventos.
    async with gemini.stream(
        "POST",
        f"/models/{GENERATION_MODEL}:streamGenerateContent",
        params={"alt": "sse"},
        json=payload,
        timeout=60.0,
    ) as response:
        if response.status_code != 200:
            body = await response.aread()
            raise GeminiApiError(
                f"Gemini stream falhou ({response.status_code}): {body.decode()}"
            )

        async for line in response.aiter_lines():
            if not line.startswith("data:"):
                continue

            chunk = json.loads(line.removeprefix("data:").strip())
            candidates = chunk.get("candidates", [])
            parts = candidates[0].get("content", {}).get("parts", []) if candidates else []

            for part in parts:
                if part.get("text"):
                    yield part["text"]
