export type RepoIdentifier = {
  owner: string;
  repo: string;
};

export function parseGithubUrl(url: string): RepoIdentifier {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error(`URL inválida: "${url}"`);
  }

  if (parsed.hostname !== "github.com") {
    throw new Error(`URL não pertence ao github.com: "${url}"`);
  }

  const segments = parsed.pathname.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new Error(`URL não tem owner/repo: "${url}"`);
  }

  const owner = segments[0];
  let repo = segments[1];

  // Remover ".git" para URLs de git clone (ex: vercel/next.js.git).
  if (repo.endsWith(".git")) {
    repo = repo.slice(0, -4);
  }

  return { owner, repo };
}

export type FileEntry = {
  path: string;
  size: number;
  sha: string;
};

type GithubRepoResponse = {
  default_branch: string;
};

type GithubTreeItem = {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
};

type GithubTreeResponse = {
  tree: GithubTreeItem[];
  truncated: boolean;
};

function buildGithubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function listRepoFiles(owner: string, repo: string): Promise<FileEntry[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN não está definido no .env.local");
  }

  const headers = buildGithubHeaders(token);

  // Descobrir o branch principal. Repos antigos usam "master", novos "main".
  const repoResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    { headers }
  );

  if (!repoResponse.ok) {
    const body = await repoResponse.text();
    throw new Error(
      `GitHub falhou a obter info do repo (${repoResponse.status} ${repoResponse.statusText}): ${body}`
    );
  }

  const repoData = (await repoResponse.json()) as GithubRepoResponse;
  const defaultBranch = repoData.default_branch;

  const treeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    { headers }
  );

  if (!treeResponse.ok) {
    const body = await treeResponse.text();
    throw new Error(
      `GitHub falhou a obter árvore (${treeResponse.status} ${treeResponse.statusText}): ${body}`
    );
  }

  const treeData = (await treeResponse.json()) as GithubTreeResponse;

  // Falhar em vez de devolver lista parcial. Indexação silenciosamente incompleta dá respostas com causa invisível.
  if (treeData.truncated) {
    throw new Error(
      `Árvore do repo ${owner}/${repo} excedeu o limite da GitHub API (>100k entries ou >7MB).`
    );
  }

  return treeData.tree
    .filter((item) => item.type === "blob")
    .map((item) => ({
      path: item.path,
      size: item.size ?? 0,
      sha: item.sha,
    }));
}

type GithubBlobResponse = {
  content: string;
  encoding: "base64" | "utf-8";
  size: number;
};

export async function fetchFileContent(
  owner: string,
  repo: string,
  sha: string
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN não está definido no .env.local");
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`,
    { headers: buildGithubHeaders(token) }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub falhou a obter blob ${sha} (${response.status} ${response.statusText}): ${body}`
    );
  }

  const data = (await response.json()) as GithubBlobResponse;

  if (data.encoding !== "base64") {
    throw new Error(`Encoding inesperado do blob ${sha}: ${data.encoding}`);
  }

  return Buffer.from(data.content, "base64").toString("utf-8");
}

const ALLOWED_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "go", "rs", "java",
  "cpp", "c", "h", "hpp",
  "cs", "rb", "php", "swift", "kt", "scala",
  "html", "css", "scss", "sass", "vue", "svelte", "astro",
  "md", "mdx", "txt", "json", "yaml", "yml", "toml",
]);

const BLOCKED_DIRECTORIES = new Set([
  "node_modules", "vendor", "bower_components",
  "dist", "build", "out", ".next", ".nuxt", "target", "bin", "obj",
  ".git", ".svn", ".hg",
  ".idea", ".vscode", "__pycache__", ".pytest_cache", ".mypy_cache",
  "coverage", ".cache", "tmp", "temp",
]);

const MAX_FILE_SIZE_BYTES = 100 * 1024;

export function shouldIndexFile(file: FileEntry): boolean {
  if (file.size === 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return false;
  }

  const segments = file.path.split("/");
  if (segments.some((segment) => BLOCKED_DIRECTORIES.has(segment))) {
    return false;
  }

  const lastDot = file.path.lastIndexOf(".");
  if (lastDot === -1) {
    return false;
  }
  const extension = file.path.slice(lastDot + 1).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension);
}
