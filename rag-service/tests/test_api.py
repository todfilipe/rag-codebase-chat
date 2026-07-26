"""Testes dos endpoints HTTP: autenticação, contrato e tradução de erros."""

from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.indexer import IndexResult
from app.core.retriever import RetrievedChunk
from app.errors import InvalidRepoUrlError, UpstreamAPIError
from app.main import app

TOKEN_HEADER = {"X-Internal-Token": "test-internal-token"}


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def test_health_nao_exige_token(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("headers", [{}, {"X-Internal-Token": "errado"}])
def test_endpoints_exigem_token_interno(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post("/chat", json={"question": "q", "repo_id": "r"}, headers=headers)

    assert response.status_code == 401
    assert "error" in response.json()


def test_index_devolve_o_resultado_da_indexacao(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_index(_client: httpx.AsyncClient, github_url: str) -> IndexResult:
        assert github_url == "https://github.com/owner/repo"
        return IndexResult(repo_id="repo-uuid", files_indexed=12, chunks_created=48)

    monkeypatch.setattr("app.main.index_repo", fake_index)

    response = client.post(
        "/index", json={"github_url": "https://github.com/owner/repo"}, headers=TOKEN_HEADER
    )

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == "repo-uuid"
    assert body["files_indexed"] == 12
    assert body["chunks_created"] == 48
    assert body["duration_ms"] >= 0


def test_chat_devolve_resposta_e_fontes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_retrieve(*args: Any, **kwargs: Any) -> list[RetrievedChunk]:
        return [
            RetrievedChunk(
                id="c1",
                file_path="src/auth.ts",
                content="function login() {}",
                start_offset=0,
                end_offset=19,
                chunk_index=0,
                similarity=0.876543,
            )
        ]

    async def fake_generate(*args: Any, **kwargs: Any) -> str:
        return "O login está em `src/auth.ts`."

    monkeypatch.setattr("app.main.retrieve_chunks", fake_retrieve)
    monkeypatch.setattr("app.main.generate_answer", fake_generate)

    response = client.post(
        "/chat",
        json={"question": "onde está o login?", "repo_id": "repo-uuid"},
        headers=TOKEN_HEADER,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "O login está em `src/auth.ts`."
    assert body["sources"] == [{"file_path": "src/auth.ts", "similarity": 0.877, "chunk_index": 0}]


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (InvalidRepoUrlError('URL inválida: "x"'), 400),
        (UpstreamAPIError("GitHub falhou"), 502),
    ],
)
def test_erros_de_dominio_viram_status_http_certo(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    expected_status: int,
) -> None:
    async def fake_index(*args: Any, **kwargs: Any) -> IndexResult:
        raise error

    monkeypatch.setattr("app.main.index_repo", fake_index)

    response = client.post("/index", json={"github_url": "x"}, headers=TOKEN_HEADER)

    assert response.status_code == expected_status
    assert response.json()["error"] == str(error)


def test_body_invalido_devolve_422_no_formato_error(client: TestClient) -> None:
    response = client.post("/chat", json={"question": "", "repo_id": ""}, headers=TOKEN_HEADER)

    assert response.status_code == 422
    assert response.json()["error"].startswith("Pedido inválido")
