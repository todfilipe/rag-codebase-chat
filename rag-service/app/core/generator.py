"""Geração da resposta final com a Gemini, ancorada nos chunks recuperados."""

import httpx

from app.config import get_settings
from app.core.retriever import RetrievedChunk
from app.errors import UpstreamAPIError

GENERATION_MODEL = "gemini-3.1-flash-lite-preview"
GEMINI_GENERATE_ENDPOINT = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GENERATION_MODEL}:generateContent"
)

SYSTEM_INSTRUCTION = """És um assistente especializado em explicar código de um repositório GitHub.

Regras:
- Responde sempre com base nos excertos de código fornecidos pelo utilizador.
- Se a informação necessária não estiver nos excertos, diz claramente que não tens informação \
suficiente. Não inventes.
- Cita os ficheiros relevantes na resposta (apenas o caminho, ex: "ver `src/index.js`").
- Responde no idioma da pergunta do utilizador.
- Sê conciso. Não repitas a pergunta."""


def build_user_prompt(question: str, chunks: list[RetrievedChunk]) -> str:
    """Junta os excertos e a pergunta no formato que o modelo espera."""
    chunks_section = "\n\n---\n\n".join(
        f"## Ficheiro: {chunk.file_path}\n\n{chunk.content}" for chunk in chunks
    )
    return f"Excertos do repositório:\n\n{chunks_section}\n\nPergunta: {question}"


async def generate_answer(
    client: httpx.AsyncClient, question: str, chunks: list[RetrievedChunk]
) -> str:
    """Pede à Gemini uma resposta fundamentada apenas nos `chunks` dados."""
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [{"role": "user", "parts": [{"text": build_user_prompt(question, chunks)}]}],
    }

    try:
        response = await client.post(
            GEMINI_GENERATE_ENDPOINT,
            headers={"x-goog-api-key": get_settings().gemini_api_key},
            json=payload,
        )
    except httpx.HTTPError as exc:
        raise UpstreamAPIError(f"Gemini inacessível ao gerar resposta: {exc}") from exc

    if response.is_error:
        raise UpstreamAPIError(
            f"Gemini generate falhou ({response.status_code} {response.reason_phrase}): "
            f"{response.text}"
        )

    candidates = response.json().get("candidates") or []
    for candidate in candidates:
        for part in candidate.get("content", {}).get("parts") or []:
            text = part.get("text")
            if text:
                answer: str = text
                return answer

    raise UpstreamAPIError("Resposta da Gemini vazia ou em formato inesperado")
