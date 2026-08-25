import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from app.core.chunker import chunk_text
from app.core.embeddings import create_gemini_client, generate_embedding
from app.core.github_client import (
    FileEntry,
    create_github_client,
    fetch_file_content,
    list_repo_files,
    parse_github_url,
    should_index_file,
)
from app.core.supabase import create_supabase_client


# Limite de pedidos em voo ao mesmo tempo, não de pedidos por minuto (decisão de 14-05-2026).
CONCURRENCY = 5

# O PostgREST aceita um array inteiro num só POST. 100 linhas por pedido corta
# round-trips sem fazer bodies absurdos: cada linha leva 768 floats de embedding.
INSERT_BATCH_SIZE = 100

# De quantos em quantos embeddings o progresso vai à base de dados. Escrever a
# cada chunk seria uma centena de PATCHes por indexação para ganhar uma barra de
# progresso mais suave do que o olho distingue.
PROGRESS_EVERY = 25


class IndexingError(Exception):
    pass


class NoIndexableFiles(Exception):
    pass


@dataclass(frozen=True)
class PreparedIndexing:
    """O que a parte síncrona do `POST /index` apurou antes de responder 202.
    Segue para a task de background, que faz o trabalho caro."""

    repo_id: str
    owner: str
    repo: str
    files: list[FileEntry]


async def prepare_indexing(github_url: str) -> PreparedIndexing:
    """Parte síncrona: tudo o que é barato e que pode falhar por causa do input.
    Se falhar aqui, o utilizador ainda está à espera da resposta e recebe um 4xx
    útil; depois do 202 já não há para onde mandar um erro de URL inválido."""
    identifier = parse_github_url(github_url)
    owner, repo = identifier.owner, identifier.repo

    async with (
        create_supabase_client() as supabase,
        create_github_client() as github,
    ):
        repo_id = await _upsert_repo(supabase, owner, repo, github_url)
        await _set_progress(
            supabase,
            repo_id,
            index_stage="listing_files",
            files_found=None,
            chunks_processed=None,
            chunks_total=None,
            index_error=None,
        )

        all_files = await list_repo_files(github, owner, repo)
        indexable_files = [file for file in all_files if should_index_file(file)]

        if not indexable_files:
            message = f"{owner}/{repo} não tem ficheiros com extensão indexável."
            await _record_failure(supabase, repo_id, "no_indexable_files", message)
            raise NoIndexableFiles(message)

        await _set_progress(supabase, repo_id, files_found=len(indexable_files))

    return PreparedIndexing(repo_id=repo_id, owner=owner, repo=repo, files=indexable_files)


async def run_indexing(prepared: PreparedIndexing) -> None:
    """Parte de background: corre depois de a resposta já ter saído. Não levanta
    exceções — não há ninguém do outro lado para as apanhar, por isso o erro é
    gravado em `repos.index_error` e é lá que o utilizador o vai ver."""
    repo_id = prepared.repo_id

    try:
        async with (
            create_supabase_client() as supabase,
            create_github_client() as github,
            create_gemini_client() as gemini,
        ):
            await _delete_old_chunks(supabase, repo_id)
            await _set_progress(supabase, repo_id, index_stage="reading_files")

            chunk_rows = await _read_and_chunk(
                github, prepared.owner, prepared.repo, repo_id, prepared.files
            )
            await _set_progress(
                supabase,
                repo_id,
                index_stage="embedding",
                chunks_total=len(chunk_rows),
                chunks_processed=0,
            )

            await _embed_and_insert(gemini, supabase, repo_id, chunk_rows)

            # Só aqui, no fim: assim a data significa "última indexação concluída", e não
            # "última tentativa". Um repo que rebentou a meio mantém a data antiga, que é
            # a verdade sobre a última vez que esteve completo.
            await _mark_indexed(supabase, repo_id)
            await _set_progress(supabase, repo_id, index_stage="done")
    except Exception as error:
        # `Exception` largo de propósito: seja o que for que corra mal aqui, se não
        # ficar gravado desaparece num log que ninguém lê. Sem rollback (decisão de
        # 14-05-2026) — o clean-slate da próxima tentativa é que limpa o estado parcial.
        async with create_supabase_client() as supabase:
            await _record_failure(supabase, repo_id, "indexing_failed", str(error))


async def _set_progress(supabase: httpx.AsyncClient, repo_id: str, **fields) -> None:
    response = await supabase.patch(
        "/repos",
        params={"id": f"eq.{repo_id}"},
        json=fields,
        headers={"Prefer": "return=minimal"},
    )

    if not response.is_success:
        raise IndexingError(
            f"Falha a gravar progresso ({response.status_code}): {response.text}"
        )


async def _record_failure(
    supabase: httpx.AsyncClient, repo_id: str, code: str, message: str
) -> None:
    await _set_progress(
        supabase,
        repo_id,
        index_stage="failed",
        index_error={"error": code, "message": message},
    )


async def _upsert_repo(
    supabase: httpx.AsyncClient, owner: str, repo: str, github_url: str
) -> str:
    response = await supabase.post(
        "/repos",
        params={"on_conflict": "owner,repo", "select": "id"},
        json={"owner": owner, "repo": repo, "url": github_url},
        headers={
            # merge-duplicates é o que transforma um POST normal em upsert.
            "Prefer": "resolution=merge-duplicates,return=representation",
            # Equivalente ao .single() do supabase-js: devolve um objeto em vez de
            # uma lista, e rebenta se vier mais do que uma linha.
            "Accept": "application/vnd.pgrst.object+json",
        },
    )

    if not response.is_success:
        raise IndexingError(
            f"Falha a upsert do repo ({response.status_code}): {response.text}"
        )

    return response.json()["id"]


async def _delete_old_chunks(supabase: httpx.AsyncClient, repo_id: str) -> None:
    # Clean slate (decisão de 14-05-2026). O ON DELETE CASCADE não ajuda aqui:
    # o repo não é apagado, só os chunks dele.
    response = await supabase.delete(
        "/code_chunks", params={"repo_id": f"eq.{repo_id}"}
    )

    if not response.is_success:
        raise IndexingError(
            f"Falha a limpar chunks antigos ({response.status_code}): {response.text}"
        )


async def _read_and_chunk(
    github: httpx.AsyncClient,
    owner: str,
    repo: str,
    repo_id: str,
    files: list[FileEntry],
) -> list[dict]:
    limit = asyncio.Semaphore(CONCURRENCY)

    async def read_one(file: FileEntry) -> tuple[FileEntry, list]:
        async with limit:
            content = await fetch_file_content(github, owner, repo, file.sha)
        # Chunkar fora do semáforo: é trabalho de CPU, não vale a pena ocupar um
        # slot que outro ficheiro podia estar a usar para falar com o GitHub.
        return file, chunk_text(content)

    # O gather devolve os resultados pela ordem em que as tarefas foram criadas,
    # não pela ordem em que acabaram, por isso o chunk_index fica determinístico.
    read_files = await asyncio.gather(*(read_one(file) for file in files))

    chunk_rows: list[dict] = []
    for file, chunks in read_files:
        for chunk_index, chunk in enumerate(chunks):
            chunk_rows.append(
                {
                    "repo_id": repo_id,
                    "file_path": file.path,
                    "content": chunk.content,
                    "start_offset": chunk.start,
                    "end_offset": chunk.end,
                    "chunk_index": chunk_index,
                }
            )

    return chunk_rows


async def _embed_and_insert(
    gemini: httpx.AsyncClient,
    supabase: httpx.AsyncClient,
    repo_id: str,
    chunk_rows: list[dict],
) -> None:
    limit = asyncio.Semaphore(CONCURRENCY)
    embedded_count = 0

    async def embed_one(row: dict) -> dict:
        nonlocal embedded_count
        async with limit:
            embedding = await generate_embedding(gemini, row["content"])

        # Incremento sem lock: o asyncio é single-threaded e não há await entre a
        # leitura e a escrita do contador.
        embedded_count += 1
        if embedded_count % PROGRESS_EVERY == 0:
            await _set_progress(supabase, repo_id, chunks_processed=embedded_count)

        return {**row, "embedding": embedding}

    embedded_rows = await asyncio.gather(*(embed_one(row) for row in chunk_rows))
    await _set_progress(
        supabase, repo_id, index_stage="saving", chunks_processed=len(embedded_rows)
    )

    for start in range(0, len(embedded_rows), INSERT_BATCH_SIZE):
        batch = embedded_rows[start : start + INSERT_BATCH_SIZE]
        response = await supabase.post(
            "/code_chunks",
            json=batch,
            # Sem isto o PostgREST devolve as linhas inseridas, embeddings incluídos:
            # recebíamos de volta os megabytes que acabámos de enviar.
            headers={"Prefer": "return=minimal"},
        )

        if not response.is_success:
            raise IndexingError(
                f"Falha a inserir batch de chunks ({response.status_code}): {response.text}"
            )


async def _mark_indexed(supabase: httpx.AsyncClient, repo_id: str) -> None:
    response = await supabase.patch(
        "/repos",
        params={"id": f"eq.{repo_id}"},
        json={"indexed_at": datetime.now(timezone.utc).isoformat()},
        headers={"Prefer": "return=minimal"},
    )

    if not response.is_success:
        raise IndexingError(
            f"Falha a marcar o repo como indexado ({response.status_code}): {response.text}"
        )
