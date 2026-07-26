"""Recuperação dos excertos mais relevantes para uma pergunta."""

from dataclasses import dataclass

import httpx

from app.core.db import get_supabase, rows_of, run_db
from app.core.embeddings import generate_embedding

DEFAULT_K = 5


@dataclass(frozen=True, slots=True)
class RetrievedChunk:
    """Chunk devolvido pela pesquisa vectorial, já com o score de similaridade."""

    id: str
    file_path: str
    content: str
    start_offset: int
    end_offset: int
    chunk_index: int
    similarity: float


async def retrieve_chunks(
    client: httpx.AsyncClient,
    question: str,
    repo_id: str,
    k: int = DEFAULT_K,
) -> list[RetrievedChunk]:
    """Devolve os top-k chunks do repo, por similaridade decrescente.

    Encapsula a geração do embedding da pergunta e a chamada à função SQL
    `match_chunks` via RPC.
    """
    query_embedding = await generate_embedding(client, question)

    rows = await run_db(
        lambda: rows_of(
            get_supabase()
            .rpc(
                "match_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_repo_id": repo_id,
                    "match_count": k,
                },
            )
            .execute()
        ),
        "correr a função match_chunks",
    )

    return [
        RetrievedChunk(
            id=str(row["id"]),
            file_path=row["file_path"],
            content=row["content"],
            start_offset=row["start_offset"],
            end_offset=row["end_offset"],
            chunk_index=row["chunk_index"],
            similarity=float(row["similarity"]),
        )
        for row in rows
    ]
