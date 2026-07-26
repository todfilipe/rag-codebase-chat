"""Testes do pipeline de indexação, com GitHub, Gemini e Supabase mockados."""

import asyncio
import base64
from typing import Any

import httpx
import pytest
import respx

from app.core import indexer
from app.core.embeddings import EMBEDDING_DIMENSIONS, GEMINI_EMBED_ENDPOINT
from app.core.github import GITHUB_API
from app.core.indexer import CONCURRENCY, index_repo
from app.core.retriever import retrieve_chunks
from tests.fakes import FakeSupabase

FILE_SOURCE = "def hello():\n    return 'world'\n"


def _blob(content: str) -> dict[str, str]:
    return {"encoding": "base64", "content": base64.b64encode(content.encode()).decode()}


def _mock_github(tree: list[dict[str, Any]], blob_content: str = FILE_SOURCE) -> None:
    respx.get(f"{GITHUB_API}/repos/owner/repo").respond(json={"default_branch": "main"})
    respx.get(f"{GITHUB_API}/repos/owner/repo/git/trees/main").respond(
        json={"truncated": False, "tree": tree}
    )
    respx.get(url__regex=rf"{GITHUB_API}/repos/owner/repo/git/blobs/.+").respond(
        json=_blob(blob_content)
    )


def _mock_embeddings() -> None:
    respx.post(GEMINI_EMBED_ENDPOINT).respond(
        json={"embedding": {"values": [0.01] * EMBEDDING_DIMENSIONS}}
    )


@respx.mock
async def test_index_repo_indexa_so_o_que_passa_no_filtro(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeSupabase()
    monkeypatch.setattr(indexer, "get_supabase", lambda: fake)

    _mock_github(
        [
            {"path": "src/main.py", "type": "blob", "sha": "s1", "size": 100},
            {"path": "README.md", "type": "blob", "sha": "s2", "size": 100},
            {"path": "node_modules/dep.js", "type": "blob", "sha": "s3", "size": 100},
            {"path": "logo.png", "type": "blob", "sha": "s4", "size": 100},
            {"path": "src", "type": "tree", "sha": "s5"},
        ]
    )
    _mock_embeddings()

    async with httpx.AsyncClient() as client:
        result = await index_repo(client, "https://github.com/owner/repo")

    assert result.repo_id == "repo-uuid"
    assert result.files_indexed == 2  # main.py e README.md
    assert result.chunks_created == 2  # cada ficheiro cabe num chunk


@respx.mock
async def test_index_repo_limpa_o_indice_antigo_antes_de_inserir(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeSupabase()
    monkeypatch.setattr(indexer, "get_supabase", lambda: fake)

    _mock_github([{"path": "src/main.py", "type": "blob", "sha": "s1", "size": 100}])
    _mock_embeddings()

    async with httpx.AsyncClient() as client:
        await index_repo(client, "https://github.com/owner/repo")

    assert fake.operations() == ["upsert", "delete", "eq", "insert"]

    _, upsert = fake.calls[0]
    assert upsert["row"] == {
        "owner": "owner",
        "repo": "repo",
        "url": "https://github.com/owner/repo",
    }
    assert upsert["on_conflict"] == "owner,repo"

    _, delete_filter = fake.calls[2]
    assert delete_filter == {"column": "repo_id", "value": "repo-uuid"}


@respx.mock
async def test_chunks_inseridos_trazem_embedding_e_offsets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeSupabase()
    monkeypatch.setattr(indexer, "get_supabase", lambda: fake)

    long_source = "x" * 5000
    _mock_github(
        [{"path": "src/main.py", "type": "blob", "sha": "s1", "size": 5000}],
        blob_content=long_source,
    )
    _mock_embeddings()

    async with httpx.AsyncClient() as client:
        await index_repo(client, "https://github.com/owner/repo")

    rows = next(payload["rows"] for operation, payload in fake.calls if operation == "insert")

    assert [row["chunk_index"] for row in rows] == list(range(len(rows)))
    assert rows[0]["start_offset"] == 0
    assert rows[-1]["end_offset"] == len(long_source)
    for row in rows:
        assert row["repo_id"] == "repo-uuid"
        assert row["file_path"] == "src/main.py"
        assert len(row["embedding"]) == EMBEDDING_DIMENSIONS


@respx.mock
async def test_chamadas_a_gemini_respeitam_o_limite_de_concorrencia(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeSupabase()
    monkeypatch.setattr(indexer, "get_supabase", lambda: fake)

    in_flight = 0
    peak = 0

    async def slow_embedding(request: httpx.Request) -> httpx.Response:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return httpx.Response(200, json={"embedding": {"values": [0.01] * EMBEDDING_DIMENSIONS}})

    _mock_github(
        [{"path": "src/main.py", "type": "blob", "sha": "s1", "size": 5000}],
        blob_content="y" * 40_000,  # ~23 chunks, bastante acima do limite
    )
    respx.post(GEMINI_EMBED_ENDPOINT).mock(side_effect=slow_embedding)

    async with httpx.AsyncClient() as client:
        result = await index_repo(client, "https://github.com/owner/repo")

    assert result.chunks_created > CONCURRENCY
    assert peak <= CONCURRENCY


@respx.mock
async def test_retrieve_chunks_passa_o_repo_e_o_k_para_a_funcao_sql(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core import retriever

    fake = FakeSupabase(
        rpc_rows=[
            {
                "id": "chunk-1",
                "file_path": "src/main.py",
                "content": FILE_SOURCE,
                "start_offset": 0,
                "end_offset": len(FILE_SOURCE),
                "chunk_index": 0,
                "similarity": 0.87,
            }
        ]
    )
    monkeypatch.setattr(retriever, "get_supabase", lambda: fake)
    _mock_embeddings()

    async with httpx.AsyncClient() as client:
        chunks = await retrieve_chunks(client, "o que faz o hello?", "repo-uuid", k=3)

    assert [chunk.file_path for chunk in chunks] == ["src/main.py"]
    assert chunks[0].similarity == pytest.approx(0.87)

    _, rpc = fake.calls[0]
    assert rpc["name"] == "match_chunks"
    assert rpc["params"]["match_repo_id"] == "repo-uuid"
    assert rpc["params"]["match_count"] == 3
    assert len(rpc["params"]["query_embedding"]) == EMBEDDING_DIMENSIONS
