import { parseGithubUrl, listRepoFiles, fetchFileContent } from "@/lib/github";

// Diagnóstico: lê um ficheiro específico do repo. Apagar quando o indexer estiver pronto.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const url = params.get("url");
  const path = params.get("path");

  if (!url || !path) {
    return Response.json(
      { error: "Passa ?url=...&path=... na query string" },
      { status: 400 }
    );
  }

  try {
    const { owner, repo } = parseGithubUrl(url);
    const files = await listRepoFiles(owner, repo);

    const target = files.find((f) => f.path === path);
    if (!target) {
      return Response.json(
        { error: `Ficheiro não encontrado: "${path}"` },
        { status: 404 }
      );
    }

    const content = await fetchFileContent(owner, repo, target.sha);

    return Response.json({
      owner,
      repo,
      path,
      sizeFromTree: target.size,
      contentLength: content.length,
      first200Chars: content.slice(0, 200),
      last100Chars: content.slice(-100),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return Response.json({ error: message }, { status: 400 });
  }
}
