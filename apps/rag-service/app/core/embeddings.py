import httpx

from app.core.config import settings


EMBEDDING_MODEL = "gemini-embedding-2"
# Default da API é 3072. Forçar 768 para bater com a coluna `embedding` em code_chunks.
EMBEDDING_DIMENSIONS = 768

GEMINI_API = "https://generativelanguage.googleapis.com/v1beta"


class GeminiApiError(Exception):
    pass


def create_gemini_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=GEMINI_API,
        headers={"x-goog-api-key": settings.gemini_api_key},
        timeout=30.0,
    )


async def generate_embedding(client: httpx.AsyncClient, text: str) -> list[float]:
    response = await client.post(
        f"/models/{EMBEDDING_MODEL}:embedContent",
        json={
            "content": {"parts": [{"text": text}]},
            "outputDimensionality": EMBEDDING_DIMENSIONS,
        },
    )

    if response.status_code != 200:
        raise GeminiApiError(
            f"Gemini embedding falhou ({response.status_code}): {response.text}"
        )

    vector = response.json()["embedding"]["values"]

    # Validado aqui, na fronteira: sem isto o erro só aparecia no insert do Supabase,
    # numa mensagem sobre a coluna em vez de sobre o Gemini.
    if len(vector) != EMBEDDING_DIMENSIONS:
        raise GeminiApiError(
            f"Esperava vetor de {EMBEDDING_DIMENSIONS} dimensões, recebi {len(vector)}"
        )

    return vector
