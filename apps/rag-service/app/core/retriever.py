from dataclasses import dataclass

from app.core.embeddings import create_gemini_client, generate_embedding
from app.core.supabase import create_supabase_client


# Top-k = 5 sem threshold de similaridade (decisão de 16-05-2026): os 5 melhores
# vão sempre, e é o LLM que decide o que lá é relevante.
DEFAULT_K = 5


class RetrievalError(Exception):
    pass


@dataclass(frozen=True)
class RetrievedChunk:
    id: str
    file_path: str
    content: str
    start_offset: int
    end_offset: int
    # Nulas nos chunks indexados antes da migration 0003 (ver o comentário lá).
    start_line: int | None
    end_line: int | None
    similarity: float


async def retrieve_chunks(
    question: str, repo_id: str, user_id: str, k: int = DEFAULT_K
) -> list[RetrievedChunk]:
    """A pergunta passa pelo mesmo modelo de embedding que indexou o código: é isso
    que põe pergunta e chunks no mesmo espaço vetorial e torna a comparação possível."""
    async with create_gemini_client() as gemini:
        query_embedding = await generate_embedding(gemini, question)

    async with create_supabase_client() as supabase:
        response = await supabase.post(
            "/rpc/match_chunks",
            json={
                "query_embedding": query_embedding,
                "match_repo_id": repo_id,
                "match_user_id": user_id,
                "match_count": k,
            },
        )

    if not response.is_success:
        raise RetrievalError(
            f"Falha na função match_chunks ({response.status_code}): {response.text}"
        )

    return [RetrievedChunk(**row) for row in response.json()]
