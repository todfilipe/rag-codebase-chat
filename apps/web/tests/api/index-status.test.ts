import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/index/[repoId]/status/route";
import { requireUser } from "@/lib/supabase/require-user";

vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));

const USER_ID = "22222222-2222-2222-2222-222222222222";
const REPO_ID = "11111111-1111-1111-1111-111111111111";

const fetchMock = vi.fn<typeof fetch>();

function readStatus(repoId: string) {
  return GET(new Request("http://localhost/api/index/x/status"), {
    params: Promise.resolve({ repoId }),
  });
}

function urlSentToRagService() {
  return new URL(String(fetchMock.mock.calls[0][0]));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RAG_SERVICE_URL", "http://rag-service.test");
  vi.stubEnv("RAG_SERVICE_INTERNAL_TOKEN", "test-internal-token");
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(requireUser).mockResolvedValue({ id: USER_ID } as User);
});

describe("GET /api/index/[repoId]/status", () => {
  it("sem sessão devolve 401 e não chama o rag-service", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      Response.json({ error: "not_authenticated" }, { status: 401 })
    );

    const response = await readStatus(REPO_ID);

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pede o estado com o token e o user_id da sessão, e devolve-o tal como vem", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ repo_id: REPO_ID, stage: "embedding" }, { status: 200 })
    );

    const response = await readStatus(REPO_ID);

    const [, init] = fetchMock.mock.calls[0];
    const url = urlSentToRagService();
    expect(url.pathname).toBe(`/index/${REPO_ID}/status`);
    expect(url.searchParams.get("user_id")).toBe(USER_ID);
    expect(init?.method).toBe("GET");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-internal-token",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ repo_id: REPO_ID, stage: "embedding" });
  });

  it("um repoId com ../ não consegue sair de /index para outra rota do rag-service", async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 404 }));
    const repoId = `../diagnostics/generate?q=x&repo_id=${REPO_ID}&user_id=33333333-3333-3333-3333-333333333333#`;

    await readStatus(repoId);

    const url = urlSentToRagService();
    expect(url.pathname).toBe(`/index/${encodeURIComponent(repoId)}/status`);
    expect([...url.searchParams.keys()]).toEqual(["user_id"]);
    expect(url.searchParams.get("user_id")).toBe(USER_ID);
  });

  it("404 do rag-service passa como 404", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "repo_not_found", message: "?" }, { status: 404 })
    );

    const response = await readStatus(REPO_ID);

    expect(response.status).toBe(404);
  });

  it("rag-service em baixo devolve 502", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const response = await readStatus(REPO_ID);

    expect(response.status).toBe(502);
  });
});
