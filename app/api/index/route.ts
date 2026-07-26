import { RagServiceError, indexRepo } from "@/lib/rag-client";

// Validação de forma fica aqui; a de domínio (o repo existe? é grande de mais?)
// é do serviço Python, que é quem fala com a GitHub.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo do pedido não é JSON válido" }, { status: 400 });
  }

  const githubUrl =
    body && typeof body === "object" && "githubUrl" in body
      ? (body as { githubUrl: unknown }).githubUrl
      : undefined;

  if (typeof githubUrl !== "string" || githubUrl.trim() === "") {
    return Response.json(
      { error: "Campo obrigatório em falta: githubUrl" },
      { status: 400 }
    );
  }

  try {
    return Response.json(await indexRepo(githubUrl.trim()));
  } catch (error) {
    if (error instanceof RagServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
