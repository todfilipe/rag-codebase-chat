"""Testes do parsing de URLs, dos filtros de ficheiros e do cliente da GitHub API."""

import base64

import httpx
import pytest
import respx

from app.core.github import (
    GITHUB_API,
    MAX_FILE_SIZE_BYTES,
    FileEntry,
    fetch_file_content,
    list_repo_files,
    parse_github_url,
    should_index_file,
)
from app.errors import InvalidRepoUrlError, RepoTooLargeError, UpstreamAPIError


@pytest.mark.parametrize(
    ("url", "owner", "repo"),
    [
        ("https://github.com/vercel/next.js", "vercel", "next.js"),
        ("https://github.com/vercel/next.js.git", "vercel", "next.js"),
        ("https://github.com/vercel/next.js/tree/canary/packages", "vercel", "next.js"),
        ("  https://github.com/owner/repo/  ", "owner", "repo"),
        ("http://github.com/owner/repo", "owner", "repo"),
    ],
)
def test_parse_github_url_aceita_formas_validas(url: str, owner: str, repo: str) -> None:
    identifier = parse_github_url(url)

    assert (identifier.owner, identifier.repo) == (owner, repo)


@pytest.mark.parametrize(
    "url",
    [
        "não é uma url",
        "github.com/owner/repo",  # sem esquema
        "https://gitlab.com/owner/repo",
        "https://github.com/owner",
        "https://github.com/",
    ],
)
def test_parse_github_url_rejeita_formas_invalidas(url: str) -> None:
    with pytest.raises(InvalidRepoUrlError):
        parse_github_url(url)


@pytest.mark.parametrize(
    ("path", "size", "expected"),
    [
        ("src/index.ts", 1000, True),
        ("README.md", 1000, True),
        ("app/core/github.py", 1000, True),
        ("src/index.ts", 0, False),  # ficheiro vazio
        ("src/index.ts", MAX_FILE_SIZE_BYTES + 1, False),  # demasiado grande
        ("node_modules/lib/index.js", 1000, False),  # directoria bloqueada
        ("a/b/__pycache__/mod.py", 1000, False),  # bloqueada em profundidade
        ("bin/tool.py", 1000, False),
        ("logo.png", 1000, False),  # extensão não permitida
        ("Makefile", 1000, False),  # sem extensão
        ("src/styles.SCSS", 1000, True),  # extensão em maiúsculas
    ],
)
def test_should_index_file(path: str, size: int, expected: bool) -> None:
    assert should_index_file(FileEntry(path=path, size=size, sha="sha")) is expected


@respx.mock
async def test_list_repo_files_segue_o_branch_por_omissao_e_filtra_blobs() -> None:
    respx.get(f"{GITHUB_API}/repos/owner/repo").respond(json={"default_branch": "master"})
    respx.get(f"{GITHUB_API}/repos/owner/repo/git/trees/master").respond(
        json={
            "truncated": False,
            "tree": [
                {"path": "src", "type": "tree", "sha": "t1"},
                {"path": "src/index.ts", "type": "blob", "sha": "b1", "size": 120},
                {"path": "LICENSE", "type": "blob", "sha": "b2"},
            ],
        }
    )

    async with httpx.AsyncClient() as client:
        files = await list_repo_files(client, "owner", "repo")

    assert [file.path for file in files] == ["src/index.ts", "LICENSE"]
    assert files[1].size == 0  # a GitHub omite `size` em alguns blobs


@respx.mock
async def test_list_repo_files_falha_quando_a_arvore_vem_truncada() -> None:
    respx.get(f"{GITHUB_API}/repos/owner/repo").respond(json={"default_branch": "main"})
    respx.get(f"{GITHUB_API}/repos/owner/repo/git/trees/main").respond(
        json={"truncated": True, "tree": []}
    )

    async with httpx.AsyncClient() as client:
        with pytest.raises(RepoTooLargeError):
            await list_repo_files(client, "owner", "repo")


@respx.mock
async def test_list_repo_files_propaga_erro_http_da_github() -> None:
    respx.get(f"{GITHUB_API}/repos/owner/repo").respond(status_code=404, text="Not Found")

    async with httpx.AsyncClient() as client:
        with pytest.raises(UpstreamAPIError):
            await list_repo_files(client, "owner", "repo")


@respx.mock
async def test_fetch_file_content_descodifica_base64() -> None:
    source = "const answer = 42;\n"
    respx.get(f"{GITHUB_API}/repos/owner/repo/git/blobs/sha1").respond(
        json={"encoding": "base64", "content": base64.b64encode(source.encode()).decode()}
    )

    async with httpx.AsyncClient() as client:
        content = await fetch_file_content(client, "owner", "repo", "sha1")

    assert content == source


@respx.mock
async def test_fetch_file_content_rejeita_encoding_inesperado() -> None:
    respx.get(f"{GITHUB_API}/repos/owner/repo/git/blobs/sha1").respond(
        json={"encoding": "utf-8", "content": "texto"}
    )

    async with httpx.AsyncClient() as client:
        with pytest.raises(UpstreamAPIError):
            await fetch_file_content(client, "owner", "repo", "sha1")
