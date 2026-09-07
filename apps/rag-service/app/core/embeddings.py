import asyncio
import time

import httpx

from app.core.config import settings


EMBEDDING_MODEL = "gemini-embedding-2"
# Default da API é 3072. Forçar 768 para bater com a coluna `embedding` em code_chunks.
EMBEDDING_DIMENSIONS = 768

GEMINI_API = "https://generativelanguage.googleapis.com/v1beta"

TOKENS_PER_MINUTE = 25000
CHARS_PER_TOKEN = 3
WINDOW_SECONDS = 60
MAX_RETRIES = 3


class TokenLimiter:
    def __init__(self, tokens_per_minute: int):
        self.tokens_per_minute = tokens_per_minute
        self.spends = []
        self.lock = asyncio.Lock()

    def _drop_old(self, now: float) -> None:
        self.spends = [
            (when, tokens)
            for when, tokens in self.spends
            if now - when < WINDOW_SECONDS
        ]

    def _used(self) -> int:
        total = 0
        for when, tokens in self.spends:
            total += tokens
        return total

    async def take(self, tokens: int) -> None:
        while True:
            async with self.lock:
                now = time.monotonic()
                self._drop_old(now)

                if self._used() + tokens <= self.tokens_per_minute:
                    self.spends.append((now, tokens))
                    return

                oldest = self.spends[0][0]
                wait = WINDOW_SECONDS - (now - oldest) + 0.1

            await asyncio.sleep(wait)


def estimate_tokens(text: str) -> int:
    return len(text) // CHARS_PER_TOKEN + 1


# Um só para o processo todo. A quota do Gemini é da chave da app e é partilhada
# por todos os utilizadores, por isso um limitador por indexação não limitava
# nada: bastavam duas ao mesmo tempo para o teto ser ultrapassado a dobrar.
limiter = TokenLimiter(TOKENS_PER_MINUTE)


class GeminiApiError(Exception):
    pass


def create_gemini_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=GEMINI_API,
        headers={"x-goog-api-key": settings.gemini_api_key},
        timeout=30.0,
    )


async def generate_embedding(client: httpx.AsyncClient, text: str) -> list[float]:
    await limiter.take(estimate_tokens(text))

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


async def generate_embeddings(
    client: httpx.AsyncClient, texts: list[str]
) -> list[list[float]]:
    tokens = sum(estimate_tokens(text) for text in texts)
    body = {
        "requests": [
            {
                "model": f"models/{EMBEDDING_MODEL}",
                "content": {"parts": [{"text": text}]},
                "outputDimensionality": EMBEDDING_DIMENSIONS,
            }
            for text in texts
        ]
    }

    attempt = 0
    while True:
        await limiter.take(tokens)
        response = await client.post(
            f"/models/{EMBEDDING_MODEL}:batchEmbedContents", json=body
        )

        if response.status_code == 200:
            break

        attempt += 1
        if response.status_code == 429 and attempt < MAX_RETRIES:
            await asyncio.sleep(WINDOW_SECONDS)
            continue

        raise GeminiApiError(
            f"Gemini batch embedding falhou ({response.status_code}): {response.text}"
        )

    vectors = [item["values"] for item in response.json()["embeddings"]]

    if len(vectors) != len(texts):
        raise GeminiApiError(
            f"Esperava {len(texts)} vetores, recebi {len(vectors)}"
        )

    for vector in vectors:
        if len(vector) != EMBEDDING_DIMENSIONS:
            raise GeminiApiError(
                f"Esperava vetor de {EMBEDDING_DIMENSIONS} dimensões, recebi {len(vector)}"
            )

    return vectors
