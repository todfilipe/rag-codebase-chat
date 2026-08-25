import { parseGithubUrl } from "@/lib/github";

// Diagnóstico: valida o parser de URLs do GitHub. Apagar quando o indexer estiver pronto.
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");

  if (!url) {
    return Response.json(
      { error: "Passa o parâmetro ?url=... na query string" },
      { status: 400 }
    );
  }

  try {
    const parsed = parseGithubUrl(url);
    return Response.json({ input: url, parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return Response.json({ input: url, error: message }, { status: 400 });
  }
}
