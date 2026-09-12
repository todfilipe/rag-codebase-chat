import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/query/route";
import { checkMessageLimit } from "@/lib/limits";
import { QUERY_TIMEOUT_MS } from "@/lib/rag-service";
import { QUERY_RATE_LIMIT, takeRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/supabase/require-user";
import { addMessageUsage } from "@/lib/usage";

vi.mock("@/lib/supabase/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/limits", () => ({ checkMessageLimit: vi.fn() }));
vi.mock("@/lib/usage", () => ({ addMessageUsage: vi.fn() }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  takeRateLimit: vi.fn(),
}));

const USER_ID = "22222222-2222-2222-2222-222222222222";
const REPO_ID = "11111111-1111-1111-1111-111111111111";

const fetchMock = vi.fn<typeof fetch>();

function askQuestion(body: unknown) {
  return POST(
    new Request("http://localhost/api/query", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

function sentToRagService() {
  const [url, init] = fetchMock.mock.calls[0];
  return { url, init, body: JSON.parse(init?.body as string) };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RAG_SERVICE_URL", "http://rag-service.test");
  vi.stubEnv("RAG_SERVICE_INTERNAL_TOKEN", "test-internal-token");
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(requireUser).mockResolvedValue({ id: USER_ID } as User);
  vi.mocked(checkMessageLimit).mockResolvedValue(null);
  vi.mocked(takeRateLimit).mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/query", () => {
  it("sem sessão devolve 401 e não chama o rag-service", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      Response.json({ error: "not_authenticated" }, { status: 401 })
    );

    const response = await askQuestion({ repoId: REPO_ID, question: "?" });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("corpo que não é JSON devolve 400", async () => {
    const response = await askQuestion("isto não é json");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_body" });
  });

  it("acima do rate limit devolve 429 antes de tocar na quota ou no rag-service", async () => {
    vi.mocked(takeRateLimit).mockReturnValue(42);

    const response = await askQuestion({ repoId: REPO_ID, question: "?" });

    expect(takeRateLimit).toHaveBeenCalledWith(`query:${USER_ID}`, QUERY_RATE_LIMIT);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(await response.json()).toMatchObject({
      error: "rate_limited",
      retry_after_seconds: 42,
    });
    expect(checkMessageLimit).not.toHaveBeenCalled();
    expect(addMessageUsage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("quota de mensagens esgotada devolve 402 sem contar uso nem chamar o rag-service", async () => {
    vi.mocked(checkMessageLimit).mockResolvedValue({
      error: "message_limit_reached",
      message: "sem mensagens",
    });

    const response = await askQuestion({ repoId: REPO_ID, question: "?" });

    expect(response.status).toBe(402);
    expect(addMessageUsage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o user_id vem da sessão e ignora o que o browser mandar", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    await askQuestion({
      repoId: REPO_ID,
      question: "  onde está o router?  ",
      user_id: "33333333-3333-3333-3333-333333333333",
    });

    const { url, init, body } = sentToRagService();
    expect(url).toBe("http://rag-service.test/query");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-internal-token",
    });
    expect(body).toEqual({
      repo_id: REPO_ID,
      question: "onde está o router?",
      user_id: USER_ID,
    });
  });

  it("passa o stream adiante sem esperar que o rag-service acabe", async () => {
    const encoder = new TextEncoder();
    let pushEvent!: (event: string) => void;
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        pushEvent = (event) => controller.enqueue(encoder.encode(event));
      },
    });
    fetchMock.mockResolvedValue(new Response(upstream, { status: 200 }));

    const response = await askQuestion({ repoId: REPO_ID, question: "?" });
    pushEvent('event: token\ndata: {"text":"Olá"}\n\n');
    const { value } = await response.body!.getReader().read();

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(new TextDecoder().decode(value)).toBe(
      'event: token\ndata: {"text":"Olá"}\n\n'
    );
  });

  it("erro JSON do rag-service chega ao browser com o mesmo status", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "repo_not_indexed", message: "sem chunks" },
        { status: 404 }
      )
    );

    const response = await askQuestion({ repoId: REPO_ID, question: "?" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "repo_not_indexed",
      message: "sem chunks",
    });
  });

  it("rag-service em baixo devolve 502", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const response = await askQuestion({ repoId: REPO_ID, question: "?" });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "rag_service_unavailable",
    });
  });

  it("rag-service sem resposta dentro do timeout devolve 504", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let fetchStarted!: () => void;
    const started = new Promise<void>((resolve) => (fetchStarted = resolve));
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          );
          fetchStarted();
        })
    );

    const pending = askQuestion({ repoId: REPO_ID, question: "?" });
    await started;
    await vi.advanceTimersByTimeAsync(QUERY_TIMEOUT_MS);
    const response = await pending;

    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ error: "upstream_timeout" });
  });
});
