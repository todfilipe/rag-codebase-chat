import base64
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from app.core.config import settings


GITHUB_API = "https://api.github.com"


class InvalidRepoUrl(ValueError):
    pass


class RepoNotFound(Exception):
    pass


class GithubApiError(Exception):
    pass


@dataclass(frozen=True)
class RepoIdentifier:
    owner: str
    repo: str


@dataclass(frozen=True)
class FileEntry:
    path: str
    size: int
    sha: str


def parse_github_url(url: str) -> RepoIdentifier:
    # Ao contrário do new URL() do JS, o urlparse não levanta nada perante lixo:
    # devolve um resultado com os campos vazios. A validação tem de ser explícita.
    parsed = urlparse(url.strip())

    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise InvalidRepoUrl(f'URL inválida: "{url}"')

    if parsed.hostname != "github.com":
        raise InvalidRepoUrl(f'URL não pertence ao github.com: "{url}"')

    segments = [segment for segment in parsed.path.split("/") if segment]

    if len(segments) < 2:
        raise InvalidRepoUrl(f'URL não tem owner/repo: "{url}"')

    owner, repo = segments[0], segments[1]

    # Remover ".git" para URLs de git clone (ex: vercel/next.js.git).
    if repo.endswith(".git"):
        repo = repo[:-4]

    return RepoIdentifier(owner=owner, repo=repo)


def create_github_client() -> httpx.AsyncClient:
    """Cliente partilhado por toda a indexação: cria-se uma vez, reutiliza a ligação."""
    return httpx.AsyncClient(
        base_url=GITHUB_API,
        headers={
            "Authorization": f"Bearer {settings.github_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        # O default do httpx são 5s, curto demais para a árvore de um repo grande.
        timeout=30.0,
        # O fetch do JS seguia redirects sozinho; o httpx não. Repos renomeados
        # respondem 301 e sem isto o porte rejeitava-os, ao contrário do protótipo.
        follow_redirects=True,
    )


async def list_repo_files(
    client: httpx.AsyncClient, owner: str, repo: str
) -> list[FileEntry]:
    # Descobrir o branch principal. Repos antigos usam "master", novos "main".
    repo_response = await client.get(f"/repos/{owner}/{repo}")

    if repo_response.status_code == 404:
        raise RepoNotFound(
            f"Repositório {owner}/{repo} não existe ou não é acessível com o PAT atual."
        )
    if repo_response.status_code != 200:
        raise GithubApiError(
            f"GitHub falhou a obter info do repo ({repo_response.status_code}): {repo_response.text}"
        )

    default_branch = repo_response.json()["default_branch"]

    tree_response = await client.get(
        f"/repos/{owner}/{repo}/git/trees/{default_branch}",
        params={"recursive": "1"},
    )

    if tree_response.status_code != 200:
        raise GithubApiError(
            f"GitHub falhou a obter árvore ({tree_response.status_code}): {tree_response.text}"
        )

    tree_data = tree_response.json()

    # Falhar em vez de devolver lista parcial. Indexação silenciosamente incompleta
    # dá respostas com causa invisível.
    if tree_data["truncated"]:
        raise GithubApiError(
            f"Árvore do repo {owner}/{repo} excedeu o limite da GitHub API (>100k entries ou >7MB)."
        )

    return [
        FileEntry(path=item["path"], size=item.get("size", 0), sha=item["sha"])
        for item in tree_data["tree"]
        if item["type"] == "blob"
    ]


async def fetch_file_content(
    client: httpx.AsyncClient, owner: str, repo: str, sha: str
) -> str:
    response = await client.get(f"/repos/{owner}/{repo}/git/blobs/{sha}")

    if response.status_code != 200:
        raise GithubApiError(
            f"GitHub falhou a obter blob {sha} ({response.status_code}): {response.text}"
        )

    blob = response.json()

    if blob["encoding"] != "base64":
        raise GithubApiError(f"Encoding inesperado do blob {sha}: {blob['encoding']}")

    # O GitHub devolve o base64 partido em linhas; o b64decode ignora os \n.
    return base64.b64decode(blob["content"]).decode("utf-8")


ALLOWED_EXTENSIONS = {
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "py", "go", "rs", "java",
    "cpp", "c", "h", "hpp",
    "cs", "rb", "php", "swift", "kt", "scala",
    "html", "css", "scss", "sass", "vue", "svelte", "astro",
    "md", "mdx", "txt", "json", "yaml", "yml", "toml",
}

BLOCKED_DIRECTORIES = {
    "node_modules", "vendor", "bower_components",
    "dist", "build", "out", ".next", ".nuxt", "target", "bin", "obj",
    ".git", ".svn", ".hg",
    ".idea", ".vscode", "__pycache__", ".pytest_cache", ".mypy_cache",
    "coverage", ".cache", "tmp", "temp",
}

MAX_FILE_SIZE_BYTES = 100 * 1024


def should_index_file(file: FileEntry) -> bool:
    if file.size == 0 or file.size > MAX_FILE_SIZE_BYTES:
        return False

    if any(segment in BLOCKED_DIRECTORIES for segment in file.path.split("/")):
        return False

    _, dot, extension = file.path.rpartition(".")
    if not dot:
        return False

    return extension.lower() in ALLOWED_EXTENSIONS
