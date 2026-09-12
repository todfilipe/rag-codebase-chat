import asyncio
import json

import httpx
from fastapi.testclient import TestClient

from app.core import indexer, retriever
from app.core.github_client import FileEntry
from app.main import app
from app.routers import indexing, query


REPO_ID = "11111111-1111-1111-1111-111111111111"
USER_ID = "22222222-2222-2222-2222-222222222222"

client = TestClient(app)
AUTH = {"Authorization": "Bearer test-internal-token"}


def fake_supabase_factory(requests_seen: list[httpx.Request], rows: list[dict]):
    def handler(request: httpx.Request) -> httpx.Response:
        requests_seen.append(request)
        return httpx.Response(200, json=rows)

    return lambda: httpx.AsyncClient(
        base_url="http://supabase.test/rest/v1",
        transport=httpx.MockTransport(handler),
    )


def test_retrieval_asks_match_chunks_for_repo_and_user(monkeypatch):
    requests_seen: list[httpx.Request] = []

    async def fake_embedding(gemini, text):
        return [0.0] * 768

    monkeypatch.setattr(retriever, "generate_embedding", fake_embedding)
    monkeypatch.setattr(
        retriever, "create_supabase_client", fake_supabase_factory(requests_seen, [])
    )

    asyncio.run(retriever.retrieve_chunks("onde está o router?", REPO_ID, USER_ID))

    [rpc] = requests_seen
    body = json.loads(rpc.content)
    assert rpc.url.path == "/rest/v1/rpc/match_chunks"
    assert body["match_repo_id"] == REPO_ID
    assert body["match_user_id"] == USER_ID


def test_every_chunk_row_carries_repo_and_owner(monkeypatch):
    async def fake_fetch(github, owner, repo, sha):
        return "x" * 5000

    monkeypatch.setattr(indexer, "fetch_file_content", fake_fetch)
    files = [
        FileEntry(path="src/a.py", size=5000, sha="sha-a"),
        FileEntry(path="src/b.py", size=5000, sha="sha-b"),
    ]

    chunk_rows = asyncio.run(
        indexer._read_and_chunk(None, "owner", "repo", REPO_ID, USER_ID, files)
    )

    assert len(chunk_rows) == 6
    assert {(row["repo_id"], row["user_id"]) for row in chunk_rows} == {
        (REPO_ID, USER_ID)
    }


def test_indexed_files_are_recorded_with_owner():
    requests_seen: list[httpx.Request] = []
    supabase = fake_supabase_factory(requests_seen, [])()
    files = [FileEntry(path="src/a.py", size=10, sha="sha-a")]

    asyncio.run(indexer._record_indexed_files(supabase, REPO_ID, USER_ID, files))

    [insert] = requests_seen
    assert json.loads(insert.content) == [
        {"repo_id": REPO_ID, "user_id": USER_ID, "file_path": "src/a.py", "sha": "sha-a"}
    ]


def test_query_without_user_id_is_refused_before_retrieval(monkeypatch):
    async def fail_retrieve(*args):
        raise AssertionError("retrieval não devia correr sem user_id")

    monkeypatch.setattr(query, "retrieve_chunks", fail_retrieve)

    response = client.post(
        "/query", json={"repo_id": REPO_ID, "question": "?"}, headers=AUTH
    )

    assert response.status_code == 400
    assert response.json()["error"] == "missing_user_id"


def test_query_with_malformed_user_id_is_refused():
    response = client.post(
        "/query",
        json={"repo_id": REPO_ID, "user_id": "' or 1=1", "question": "?"},
        headers=AUTH,
    )

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_user_id"


def test_query_hands_user_id_to_retrieval(monkeypatch):
    retrieval_calls = []

    async def fake_retrieve(question, repo_id, user_id):
        retrieval_calls.append((repo_id, user_id))
        return []

    monkeypatch.setattr(query, "retrieve_chunks", fake_retrieve)

    response = client.post(
        "/query",
        json={"repo_id": REPO_ID, "user_id": USER_ID, "question": "?"},
        headers=AUTH,
    )

    assert response.status_code == 404
    assert response.json()["error"] == "repo_not_indexed"
    assert retrieval_calls == [(REPO_ID, USER_ID)]


def test_index_without_user_id_is_refused():
    response = client.post(
        "/index", json={"repo_url": "https://github.com/a/b"}, headers=AUTH
    )

    assert response.status_code == 400
    assert response.json()["error"] == "missing_user_id"


def test_index_hands_user_id_to_indexer(monkeypatch):
    prepared_for = []

    async def fake_prepare(repo_url, user_id, force):
        prepared_for.append(user_id)
        return indexer.PreparedIndexing(
            repo_id=REPO_ID, owner="a", repo="b", user_id=user_id, files=[], force=force
        )

    async def fake_run(prepared):
        pass

    monkeypatch.setattr(indexing, "prepare_indexing", fake_prepare)
    monkeypatch.setattr(indexing, "run_indexing", fake_run)

    response = client.post(
        "/index",
        json={"repo_url": "https://github.com/a/b", "user_id": USER_ID},
        headers=AUTH,
    )

    assert response.status_code == 202
    assert prepared_for == [USER_ID]


def test_status_without_user_id_is_refused():
    response = client.get(f"/index/{REPO_ID}/status", headers=AUTH)

    assert response.status_code == 400
    assert response.json()["error"] == "missing_user_id"


def test_status_only_reads_the_repo_if_it_belongs_to_the_user(monkeypatch):
    requests_seen: list[httpx.Request] = []
    monkeypatch.setattr(
        indexing, "create_supabase_client", fake_supabase_factory(requests_seen, [])
    )

    response = client.get(
        f"/index/{REPO_ID}/status", params={"user_id": USER_ID}, headers=AUTH
    )

    [select] = requests_seen
    assert select.url.params["id"] == f"eq.{REPO_ID}"
    assert select.url.params["user_id"] == f"eq.{USER_ID}"
    assert response.status_code == 404
    assert response.json()["error"] == "repo_not_found"


def test_status_with_malformed_repo_id_never_reaches_supabase(monkeypatch):
    requests_seen: list[httpx.Request] = []
    monkeypatch.setattr(
        indexing, "create_supabase_client", fake_supabase_factory(requests_seen, [])
    )

    response = client.get(
        "/index/not-a-uuid/status", params={"user_id": USER_ID}, headers=AUTH
    )

    assert response.status_code == 404
    assert requests_seen == []
