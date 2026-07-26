"""Cliente da GitHub API: parsing de URLs, listagem da árvore e leitura de blobs."""

import base64
import binascii
from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.errors import InvalidRepoUrlError, RepoTooLargeError, UpstreamAPIError

GITHUB_API = "https://api.github.com"

ALLOWED_EXTENSIONS = frozenset(
    {
        "ts", "tsx", "js", "jsx", "mjs", "cjs",
        "py", "go", "rs", "java",
        "cpp", "c", "h", "hpp",
        "cs", "rb", "php", "swift", "kt", "scala",
        "html", "css", "scss", "sass", "vue", "svelte", "astro",
        "md", "mdx", "txt", "json", "yaml", "yml", "toml",
    }
)  # fmt: skip

BLOCKED_DIRECTORIES = frozenset(
    {
        "node_modules", "vendor", "bower_components",
        "dist", "build", "out", ".next", ".nuxt", "target", "bin", "obj",
        ".git", ".svn", ".hg",
        ".idea", ".vscode", "__pycache__", ".pytest_cache", ".mypy_cache",
        "coverage", ".cache", "tmp", "temp",
    }
)  # fmt: skip

MAX_FILE_SIZE_BYTES = 100 * 1024


@dataclass(frozen=True, slots=True)
class RepoIdentifier:
    owner: str
    repo: str


@dataclass(frozen=True, slots=True)
class FileEntry:
    path: str
    size: int
    sha: str


def parse_github_url(url: str) -> RepoIdentifier:
    """Extrai owner/repo de uma URL do github.com."""
    parsed = urlparse(url.strip())

    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise InvalidRepoUrlError(f'URL inválida: "{url}"')

    if parsed.hostname != "github.com":
        raise InvalidRepoUrlError(f'URL não pertence ao github.com: "{url}"')

    segments = [segment for segment in parsed.path.split("/") if segment]

    if len(segments) < 2:
        raise InvalidRepoUrlError(f'URL não tem owner/repo: "{url}"')

    owner, repo = segments[0], segments[1]

    # Remover ".git" para URLs de git clone (ex: vercel/next.js.git).
    repo = repo.removesuffix(".git")

    return RepoIdentifier(owner=owner, repo=repo)


def _github_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {get_settings().github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def _get_json(client: httpx.AsyncClient, url: str, context: str) -> dict[str, object]:
    try:
        response = await client.get(url, headers=_github_headers())
    except httpx.HTTPError as exc:
        raise UpstreamAPIError(f"GitHub inacessível ao {context}: {exc}") from exc

    if response.is_error:
        raise UpstreamAPIError(
            f"GitHub falhou a {context} ({response.status_code} {response.reason_phrase}): "
            f"{response.text}"
        )

    payload: dict[str, object] = response.json()
    return payload


async def list_repo_files(client: httpx.AsyncClient, owner: str, repo: str) -> list[FileEntry]:
    """Devolve todos os blobs do branch principal do repositório."""
    # Descobrir o branch principal. Repos antigos usam "master", novos "main".
    repo_data = await _get_json(client, f"{GITHUB_API}/repos/{owner}/{repo}", "obter info do repo")
    default_branch = repo_data.get("default_branch")
    if not isinstance(default_branch, str):
        raise UpstreamAPIError(f"GitHub não devolveu default_branch para {owner}/{repo}")

    tree_data = await _get_json(
        client,
        f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1",
        "obter árvore",
    )

    # Falhar em vez de devolver lista parcial: indexação silenciosamente incompleta
    # dá respostas erradas com causa invisível.
    if tree_data.get("truncated"):
        raise RepoTooLargeError(
            f"Árvore do repo {owner}/{repo} excedeu o limite da GitHub API (>100k entries ou >7MB)."
        )

    tree = tree_data.get("tree")
    if not isinstance(tree, list):
        raise UpstreamAPIError(f"GitHub devolveu árvore em formato inesperado para {owner}/{repo}")

    return [
        FileEntry(path=item["path"], size=item.get("size", 0), sha=item["sha"])
        for item in tree
        if isinstance(item, dict) and item.get("type") == "blob"
    ]


async def fetch_file_content(client: httpx.AsyncClient, owner: str, repo: str, sha: str) -> str:
    """Lê o conteúdo de um blob e descodifica-o para texto."""
    blob = await _get_json(
        client, f"{GITHUB_API}/repos/{owner}/{repo}/git/blobs/{sha}", f"obter blob {sha}"
    )

    encoding = blob.get("encoding")
    if encoding != "base64":
        raise UpstreamAPIError(f"Encoding inesperado do blob {sha}: {encoding}")

    content = blob.get("content")
    if not isinstance(content, str):
        raise UpstreamAPIError(f"Blob {sha} veio sem conteúdo")

    try:
        raw = base64.b64decode(content)
    except (binascii.Error, ValueError) as exc:
        raise UpstreamAPIError(f"Blob {sha} não é base64 válido: {exc}") from exc

    return raw.decode("utf-8", errors="replace")


def should_index_file(file: FileEntry) -> bool:
    """Decide se um ficheiro entra na indexação (código e texto, não artefactos)."""
    if file.size == 0 or file.size > MAX_FILE_SIZE_BYTES:
        return False

    path = PurePosixPath(file.path)

    if any(part in BLOCKED_DIRECTORIES for part in path.parts):
        return False

    return path.suffix.removeprefix(".").lower() in ALLOWED_EXTENSIONS
