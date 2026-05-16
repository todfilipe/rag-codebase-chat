import { parseGithubUrl, listRepoFiles, shouldIndexFile } from "@/lib/github";

// Diagnóstico: lista ficheiros do repo e mostra o filtro em acção. Apagar quando o indexer estiver pronto.
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");

  if (!url) {
    return Response.json(
      { error: "Passa o parâmetro ?url=... na query string" },
      { status: 400 }
    );
  }

  try {
    const { owner, repo } = parseGithubUrl(url);
    const allFiles = await listRepoFiles(owner, repo);

    const indexable = allFiles.filter(shouldIndexFile);
    const rejected = allFiles.filter((f) => !shouldIndexFile(f));

    const indexableLargest = [...indexable]
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .map((f) => ({ path: f.path, size: f.size }));

    return Response.json({
      owner,
      repo,
      totals: {
        all: allFiles.length,
        indexable: indexable.length,
        rejected: rejected.length,
        keepRatio: `${((indexable.length / allFiles.length) * 100).toFixed(1)}%`,
      },
      indexable: {
        first20Paths: indexable.slice(0, 20).map((f) => f.path),
        top5Largest: indexableLargest,
      },
      rejectedSample: rejected.slice(0, 15).map((f) => ({
        path: f.path,
        size: f.size,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return Response.json({ error: message }, { status: 400 });
  }
}
