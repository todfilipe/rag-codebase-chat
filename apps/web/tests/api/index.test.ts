import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/index/route";
import { checkRepoLimit } from "@/lib/limits";
import { INDEX_RATE_LIMIT, takeRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/supabase/require-user";
import { hasRepo } from "@/lib/usage";

vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/limits", () => ({ checkRepoLimit: vi.fn() }));
vi.mock("@/lib/usage", () => ({ hasRepo: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  takeRateLimit: vi.fn(),
}));

const USER_ID = "22222222-2222-2222-2222-222222222222";

const fetchMock = vi.fn<typeof fetch>();

function connectRepo(body: unknown) {
  return POST(
    new Request("http://localhost/api/index", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RAG_SERVICE_URL", "http://rag-service.test");
  vi.stubEnv("RAG_SERVICE_INTERNAL_TOKEN", "test-internal-token");
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(requireUser).mockResolvedValue({ id: USER_ID } as User);
  vi.mocked(checkRepoLimit).mockResolvedValue(null);
  vi.mocked(hasRepo).mockResolvedValue(false);
  vi.mocked(takeRateLimit).mockReturnValue(null);
});

describe("POST /api/index", () => {
  it("sem sessão devolve 401 e não chama o rag-service", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      Response.json({ error: "not_authenticated" }, { status: 401 })
    );

    const response = await connectRepo({ repoUrl: "https://github.com/a/b" });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acima do rate limit devolve 429 sem chamar o rag-service", async () => {
    vi.mocked(takeRateLimit).mockReturnValue(30);

    const response = await connectRepo({ repoUrl: "https://github.com/a/b" });

    expect(takeRateLimit).toHaveBeenCalledWith(`index:${USER_ID}`, INDEX_RATE_LIMIT);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem repoUrl devolve 400", async () => {
    const response = await connectRepo({});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_repo_url" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("repositório novo acima do limite de repositórios devolve 402", async () => {
    vi.mocked(checkRepoLimit).mockResolvedValue({
      error: "repo_limit_reached",
      message: "sem vagas",
    });

    const response = await connectRepo({ repoUrl: "https://github.com/a/b" });

    expect(checkRepoLimit).toHaveBeenCalledWith(true);
    expect(response.status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reindexar um repositório que já existe não conta como repositório novo", async () => {
    vi.mocked(hasRepo).mockResolvedValue(true);
    fetchMock.mockResolvedValue(Response.json({}, { status: 202 }));

    await connectRepo({ repoUrl: "https://github.com/a/b" });

    expect(checkRepoLimit).toHaveBeenCalledWith(false);
  });

  it("manda o user_id da sessão e devolve o 202 do rag-service", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ repo_id: "r1", stage: "reading_files" }, { status: 202 })
    );

    const response = await connectRepo({
      repoUrl: " https://github.com/a/b ",
      user_id: "33333333-3333-3333-3333-333333333333",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://rag-service.test/index");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-internal-token",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      repo_url: "https://github.com/a/b",
      user_id: USER_ID,
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ repo_id: "r1", stage: "reading_files" });
  });
});
