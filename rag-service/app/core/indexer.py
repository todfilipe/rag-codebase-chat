"""Pipeline de indexação: GitHub -> chunks -> embeddings -> Supabase."""

import asyncio
from dataclasses import dataclass
from functools import partial
from typing import Any

import httpx

from app.core.chunker import chunk_text
from app.core.db import get_supabase, rows_of, run_db
from app.core.embeddings import generate_embedding
from app.core.github import (
    FileEntry,
    fetch_file_content,
    list_repo_files,
    parse_github_url,
    should_index_file,
)
from app.errors import DatabaseError

# Chamadas simultâneas às APIs externas. Limitado a 5 para respeitar o RPM da
# Gemini (100 req/min na chave gratuita) com folga para latência variável.
CONCURRENCY = 5

# Quantos chunks embebemos e inserimos por ronda. Mantém o pico de memória
# limitado (cada embedding são 768 floats) sem fazer um round-trip por chunk.
INSERT_BATCH_SIZE = 50


@dataclass(frozen=True, slots=True)
class IndexResult:
    repo_id: str
    files_indexed: int
    chunks_created: int


async def _upsert_repo(owner: str, repo: str, github_url: str) -> str:
    """Cria a linha do repo na primeira indexação; devolve o UUID em qualquer caso."""
    rows = await run_db(
        lambda: rows_of(
            get_supabase()
            .table("repos")
            .upsert({"owner": owner, "repo": repo, "url": github_url}, on_conflict="owner,repo")
            .execute()
        ),
        "fazer upsert do repo",
    )

    if not rows:
        raise DatabaseError("Upsert do repo não devolveu nenhuma linha")

    return str(rows[0]["id"])


async def _delete_existing_chunks(repo_id: str) -> None:
    """Clean slate.

    O ON DELETE CASCADE não dispara aqui porque o repo não chega a ser apagado,
    por isso limpamos os chunks antigos à mão antes de reindexar.
    """
    await run_db(
        lambda: get_supabase().table("code_chunks").delete().eq("repo_id", repo_id).execute(),
        "limpar chunks antigos",
    )


async def _collect_chunk_rows(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    repo_id: str,
    files: list[FileEntry],
    semaphore: asyncio.Semaphore,
) -> list[dict[str, Any]]:
    """Lê e chunka todos os ficheiros, com no máximo CONCURRENCY leituras em voo."""

    async def read_and_chunk(file: FileEntry) -> list[dict[str, Any]]:
        async with semaphore:
            content = await fetch_file_content(client, owner, repo, file.sha)

        return [
            {
                "repo_id": repo_id,
                "file_path": file.path,
                "content": chunk.content,
                "start_offset": chunk.start,
                "end_offset": chunk.end,
                "chunk_index": index,
            }
            for index, chunk in enumerate(chunk_text(content))
        ]

    per_file = await asyncio.gather(*(read_and_chunk(file) for file in files))
    return [row for rows in per_file for row in rows]


def _insert_chunks(payload: list[dict[str, Any]]) -> None:
    get_supabase().table("code_chunks").insert(payload).execute()


async def _embed_and_store(
    client: httpx.AsyncClient,
    rows: list[dict[str, Any]],
    semaphore: asyncio.Semaphore,
) -> None:
    """Gera os embeddings e insere-os no Supabase, lote a lote."""

    async def embed(row: dict[str, Any]) -> dict[str, Any]:
        async with semaphore:
            embedding = await generate_embedding(client, row["content"])
        return {**row, "embedding": embedding}

    for start in range(0, len(rows), INSERT_BATCH_SIZE):
        batch = rows[start : start + INSERT_BATCH_SIZE]
        enriched = list(await asyncio.gather(*(embed(row) for row in batch)))
        await run_db(partial(_insert_chunks, enriched), "inserir lote de chunks")


async def index_repo(client: httpx.AsyncClient, github_url: str) -> IndexResult:
    """Indexa um repositório do GitHub de raiz, substituindo qualquer índice anterior."""
    identifier = parse_github_url(github_url)
    owner, repo = identifier.owner, identifier.repo

    repo_id = await _upsert_repo(owner, repo, github_url)
    await _delete_existing_chunks(repo_id)

    all_files = await list_repo_files(client, owner, repo)
    indexable = [file for file in all_files if should_index_file(file)]

    semaphore = asyncio.Semaphore(CONCURRENCY)

    chunk_rows = await _collect_chunk_rows(client, owner, repo, repo_id, indexable, semaphore)
    await _embed_and_store(client, chunk_rows, semaphore)

    return IndexResult(
        repo_id=repo_id,
        files_indexed=len(indexable),
        chunks_created=len(chunk_rows),
    )
