import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from app.core.chunker import chunk_text
from app.core.embeddings import create_gemini_client, generate_embeddings
from app.core.github_client import (
    FileEntry,
    create_github_client,
    fetch_file_content,
    list_repo_files,
    parse_github_url,
    should_index_file,
)
from app.core.limits import (
    LimitReached,
    add_chunk_usage,
    get_month_chunks,
    get_plan,
)
from app.core.supabase import create_supabase_client


# Limite de pedidos em voo ao mesmo tempo, não de pedidos por minuto (decisão de 14-05-2026).
CONCURRENCY = 5

# O PostgREST aceita um array inteiro num só POST. 100 linhas por pedido corta
# round-trips sem fazer bodies absurdos: cada linha leva 768 floats de embedding.
INSERT_BATCH_SIZE = 100

# Chunks por pedido ao Gemini. O que trava a indexação são os tokens por minuto,
# não os pedidos, por isso o batch não a acelera — serve para não gastar o limite
# diário de pedidos do plano gratuito.
EMBED_BATCH_SIZE = 25


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
    user_id: str
    files: list[FileEntry]
    force: bool


async def prepare_indexing(
    github_url: str, user_id: str, force: bool = False
) -> PreparedIndexing:
    """Parte síncrona: tudo o que é barato e que pode falhar por causa do input.
    Se falhar aqui, o utilizador ainda está à espera da resposta e recebe um 4xx
    útil; depois do 202 já não há para onde mandar um erro de URL inválido."""
    identifier = parse_github_url(github_url)
    owner, repo = identifier.owner, identifier.repo

    async with (
        create_supabase_client() as supabase,
        create_github_client() as github,
    ):
        repo_id = await _upsert_repo(supabase, owner, repo, github_url, user_id)
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

    return PreparedIndexing(
        repo_id=repo_id,
        owner=owner,
        repo=repo,
        user_id=user_id,
        files=indexable_files,
        force=force,
    )


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
            indexed_shas = (
                {} if prepared.force else await _fetch_indexed_shas(supabase, repo_id)
            )
            changed, removed = _plan_changes(prepared.files, indexed_shas)

            if indexed_shas:
                stale_paths = [file.path for file in changed] + removed
                await _forget_files(supabase, repo_id, stale_paths)
            else:
                await _reset_repo_index(supabase, repo_id)

            await _set_progress(supabase, repo_id, index_stage="reading_files")

            chunk_rows = await _read_and_chunk(
                github,
                prepared.owner,
                prepared.repo,
                repo_id,
                prepared.user_id,
                changed,
            )

            await _check_chunk_limits(
                supabase, repo_id, prepared.user_id, len(chunk_rows)
            )

            await _set_progress(
                supabase,
                repo_id,
                index_stage="embedding",
                chunks_total=len(chunk_rows),
                chunks_processed=0,
            )

            await _embed_and_insert(
                gemini, supabase, repo_id, prepared.user_id, chunk_rows
            )
            await _record_indexed_files(supabase, repo_id, prepared.user_id, changed)

            # Só aqui, no fim: assim a data significa "última indexação concluída", e não
            # "última tentativa". Um repo que rebentou a meio mantém a data antiga, que é
            # a verdade sobre a última vez que esteve completo.
            await _mark_indexed(supabase, repo_id)
            await _set_progress(supabase, repo_id, index_stage="done")
    except LimitReached as error:
        async with create_supabase_client() as supabase:
            chunks = await _count_repo_chunks(supabase, repo_id)

            if chunks > 0:
                await _set_progress(
                    supabase,
                    repo_id,
                    index_stage="done",
                    index_error={"error": error.code, "message": str(error)},
                )
            else:
                await _record_failure(supabase, repo_id, error.code, str(error))
    except Exception as error:
        # `Exception` largo de propósito: seja o que for que corra mal aqui, se não
        # ficar gravado desaparece num log que ninguém lê. Continua sem rollback
        # (decisão de 14-05-2026): os ficheiros que ficaram sem registo em
        # indexed_files são refeitos na tentativa seguinte.
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
    supabase: httpx.AsyncClient,
    owner: str,
    repo: str,
    github_url: str,
    user_id: str,
) -> str:
    response = await supabase.post(
        "/repos",
        params={"on_conflict": "owner,repo,user_id", "select": "id"},
        json={"owner": owner, "repo": repo, "url": github_url, "user_id": user_id},
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


async def _fetch_indexed_shas(
    supabase: httpx.AsyncClient, repo_id: str
) -> dict[str, str]:
    response = await supabase.get(
        "/indexed_files",
        params={"repo_id": f"eq.{repo_id}", "select": "file_path,sha"},
    )

    if not response.is_success:
        raise IndexingError(
            f"Falha a ler ficheiros indexados ({response.status_code}): {response.text}"
        )

    return {row["file_path"]: row["sha"] for row in response.json()}


def _plan_changes(
    files: list[FileEntry], indexed_shas: dict[str, str]
) -> tuple[list[FileEntry], list[str]]:
    changed = [file for file in files if indexed_shas.get(file.path) != file.sha]

    current_paths = {file.path for file in files}
    removed = [path for path in indexed_shas if path not in current_paths]

    return changed, removed


async def _forget_files(
    supabase: httpx.AsyncClient, repo_id: str, file_paths: list[str]
) -> None:
    for file_path in file_paths:
        params = {"repo_id": f"eq.{repo_id}", "file_path": f"eq.{file_path}"}

        chunks = await supabase.delete("/code_chunks", params=params)
        if not chunks.is_success:
            raise IndexingError(
                f"Falha a limpar chunks de {file_path} ({chunks.status_code}): {chunks.text}"
            )

        entry = await supabase.delete("/indexed_files", params=params)
        if not entry.is_success:
            raise IndexingError(
                f"Falha a limpar registo de {file_path} ({entry.status_code}): {entry.text}"
            )


async def _reset_repo_index(supabase: httpx.AsyncClient, repo_id: str) -> None:
    for table in ("/code_chunks", "/indexed_files"):
        response = await supabase.delete(table, params={"repo_id": f"eq.{repo_id}"})

        if not response.is_success:
            raise IndexingError(
                f"Falha a limpar {table} ({response.status_code}): {response.text}"
            )


async def _record_indexed_files(
    supabase: httpx.AsyncClient,
    repo_id: str,
    user_id: str,
    files: list[FileEntry],
) -> None:
    if not files:
        return

    rows = [
        {
            "repo_id": repo_id,
            "user_id": user_id,
            "file_path": file.path,
            "sha": file.sha,
        }
        for file in files
    ]

    response = await supabase.post(
        "/indexed_files", json=rows, headers={"Prefer": "return=minimal"}
    )

    if not response.is_success:
        raise IndexingError(
            f"Falha a gravar ficheiros indexados ({response.status_code}): {response.text}"
        )


async def _read_and_chunk(
    github: httpx.AsyncClient,
    owner: str,
    repo: str,
    repo_id: str,
    user_id: str,
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
                    "user_id": user_id,
                    "file_path": file.path,
                    "content": chunk.content,
                    "start_offset": chunk.start,
                    "end_offset": chunk.end,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "chunk_index": chunk_index,
                }
            )

    return chunk_rows


async def _count_repo_chunks(supabase: httpx.AsyncClient, repo_id: str) -> int:
    response = await supabase.get(
        "/code_chunks",
        params={"repo_id": f"eq.{repo_id}", "select": "id"},
        headers={"Prefer": "count=exact", "Range": "0-0"},
    )

    if not response.is_success:
        raise IndexingError(
            f"Falha a contar chunks do repo ({response.status_code}): {response.text}"
        )

    content_range = response.headers.get("content-range", "")
    return int(content_range.split("/")[-1])


async def _check_chunk_limits(
    supabase: httpx.AsyncClient, repo_id: str, user_id: str, new_chunks: int
) -> None:
    plan = await get_plan(supabase, user_id)

    kept_chunks = await _count_repo_chunks(supabase, repo_id)
    repo_chunks = kept_chunks + new_chunks

    if repo_chunks > plan["max_chunks_per_repo"]:
        raise LimitReached(
            "repo_too_large",
            f"O repositório dá {repo_chunks} chunks e o plano {plan['id']} "
            f"permite {plan['max_chunks_per_repo']} por repositório.",
        )

    if new_chunks == 0:
        return

    used = await get_month_chunks(supabase, user_id)

    if used + new_chunks > plan["max_chunks_per_month"]:
        raise LimitReached(
            "chunk_budget_exceeded",
            f"Esta indexação são {new_chunks} chunks e no plano {plan['id']} "
            f"já usaste {used} dos {plan['max_chunks_per_month']} deste mês.",
        )


async def _embed_and_insert(
    gemini: httpx.AsyncClient,
    supabase: httpx.AsyncClient,
    repo_id: str,
    user_id: str,
    chunk_rows: list[dict],
) -> None:
    embedded_rows: list[dict] = []

    for start in range(0, len(chunk_rows), EMBED_BATCH_SIZE):
        batch = chunk_rows[start : start + EMBED_BATCH_SIZE]
        vectors = await generate_embeddings(
            gemini, [row["content"] for row in batch]
        )

        for row, vector in zip(batch, vectors):
            embedded_rows.append({**row, "embedding": vector})

        await _set_progress(
            supabase, repo_id, chunks_processed=len(embedded_rows)
        )
        await add_chunk_usage(supabase, user_id, len(batch))

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
