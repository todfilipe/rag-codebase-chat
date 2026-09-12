import { describe, expect, it } from "vitest";
import { takeRateLimit } from "@/lib/rate-limit";

const THREE_PER_MINUTE = { limit: 3, windowMs: 60_000 };

describe("takeRateLimit", () => {
  it("deixa passar até ao limite e recusa o pedido seguinte", () => {
    expect(takeRateLimit("burst", THREE_PER_MINUTE, 1_000)).toBeNull();
    expect(takeRateLimit("burst", THREE_PER_MINUTE, 1_000)).toBeNull();
    expect(takeRateLimit("burst", THREE_PER_MINUTE, 1_000)).toBeNull();

    expect(takeRateLimit("burst", THREE_PER_MINUTE, 1_000)).toBe(60);
  });

  it("janela deslizante: um lugar abre quando o pedido mais antigo sai", () => {
    takeRateLimit("sliding", THREE_PER_MINUTE, 0);
    takeRateLimit("sliding", THREE_PER_MINUTE, 20_000);
    takeRateLimit("sliding", THREE_PER_MINUTE, 40_000);

    expect(takeRateLimit("sliding", THREE_PER_MINUTE, 50_000)).toBe(10);
    expect(takeRateLimit("sliding", THREE_PER_MINUTE, 60_000)).toBeNull();
    expect(takeRateLimit("sliding", THREE_PER_MINUTE, 60_001)).toBe(20);
  });

  it("utilizadores diferentes não partilham o limite", () => {
    takeRateLimit("user-a", THREE_PER_MINUTE, 0);
    takeRateLimit("user-a", THREE_PER_MINUTE, 0);
    takeRateLimit("user-a", THREE_PER_MINUTE, 0);

    expect(takeRateLimit("user-a", THREE_PER_MINUTE, 0)).not.toBeNull();
    expect(takeRateLimit("user-b", THREE_PER_MINUTE, 0)).toBeNull();
  });
});
