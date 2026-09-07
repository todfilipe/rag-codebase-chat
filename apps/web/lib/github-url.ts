// Espelho, no cliente, do parse_github_url do rag-service. A duplicação é
// deliberada: esta versão existe para não gastar uma ida ao servidor com um URL
// que já se sabe inválido. A do servidor é que é a que conta — o rag-service não
// pode assumir que o único chamador é este formulário.

export type ParsedRepoUrl = { owner: string; repo: string };

export function parseGithubRepoUrl(raw: string): ParsedRepoUrl | null {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const [owner, repoSegment] = segments;
  // URLs de git clone trazem o sufixo (ex: vercel/next.js.git).
  const repo = repoSegment.endsWith(".git")
    ? repoSegment.slice(0, -4)
    : repoSegment;

  return { owner, repo };
}

// O inverso do parse. O GET /index/{repoId}/status devolve owner e repo mas não
// o URL, e uma reindexação precisa de voltar a mandar um URL ao POST /index.
export function buildGithubRepoUrl({ owner, repo }: ParsedRepoUrl): string {
  return `https://github.com/${owner}/${repo}`;
}

// Link para o excerto no GitHub. `blob/HEAD` em vez do nome do branch: o GitHub
// resolve HEAD para o branch principal do repo, o que poupa guardar qual é (o
// rag-service descobre-o na indexação, mas nunca chegou a gravá-lo).
export function buildGithubFileUrl(
  { owner, repo }: ParsedRepoUrl,
  filePath: string,
  startLine: number | null,
  endLine: number | null
): string {
  // Encode segmento a segmento, senão as barras do caminho viravam %2F.
  const path = filePath.split("/").map(encodeURIComponent).join("/");
  const anchor =
    startLine === null ? "" : `#L${startLine}-L${endLine ?? startLine}`;

  return `https://github.com/${owner}/${repo}/blob/HEAD/${path}${anchor}`;
}
