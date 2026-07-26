"""Geração de embeddings com a Gemini."""

import httpx

from app.config import get_settings
from app.errors import EmbeddingDimensionError, UpstreamAPIError

EMBEDDING_MODEL = "gemini-embedding-2"

# O default da API é 3072. Forçamos 768 para bater certo com a coluna
# `embedding` da tabela code_chunks (vector(768)).
EMBEDDING_DIMENSIONS = 768

GEMINI_EMBED_ENDPOINT = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL}:embedContent"
)


async def generate_embedding(client: httpx.AsyncClient, text: str) -> list[float]:
    """Devolve o vector de EMBEDDING_DIMENSIONS dimensões para `text`."""
    payload = {
        "content": {"parts": [{"text": text}]},
        "outputDimensionality": EMBEDDING_DIMENSIONS,
    }

    try:
        response = await client.post(
            GEMINI_EMBED_ENDPOINT,
            headers={"x-goog-api-key": get_settings().gemini_api_key},
            json=payload,
        )
    except httpx.HTTPError as exc:
        raise UpstreamAPIError(f"Gemini inacessível ao gerar embedding: {exc}") from exc

    if response.is_error:
        raise UpstreamAPIError(
            f"Gemini embedding falhou ({response.status_code} {response.reason_phrase}): "
            f"{response.text}"
        )

    vector = response.json().get("embedding", {}).get("values")

    if not isinstance(vector, list) or len(vector) != EMBEDDING_DIMENSIONS:
        received = len(vector) if isinstance(vector, list) else "nada"
        raise EmbeddingDimensionError(
            f"Esperava vector de {EMBEDDING_DIMENSIONS} dimensões, recebi {received}"
        )

    return [float(value) for value in vector]
