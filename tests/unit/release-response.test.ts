import { describe, expect, it, vi } from "vitest";
import { releaseResponse } from "../../scripts/release-response";

const current = () => new Response("ok", { headers: { "x-cheapseggs-revision": "current" } });
describe("deployment propagation boundary", () => {
  it("waits for each endpoint independently, without accepting the old revision", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("old", { headers: { "x-cheapseggs-revision": "old" } }))
      .mockResolvedValueOnce(current());
    const pause = vi.fn(async () => {});
    const response = await releaseResponse("https://cheapseggs.com/api/health", "current", {
      fetcher,
      pause,
    });
    expect(response.headers.get("x-cheapseggs-revision")).toBe("current");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
  });
  it("does not retry application failures", async () => {
    const fetcher = vi.fn(async () => new Response("failure", { status: 500 }));
    const response = await releaseResponse("https://cheapseggs.com/api/ready", "current", {
      fetcher,
    });
    expect(response.status).toBe(500);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("fails closed when a revision remains missing or stale", async () => {
    const fetcher = vi.fn(async () => new Response("missing revision"));
    await expect(
      releaseResponse("https://cheapseggs.com/", "current", {
        fetcher,
        attempts: 2,
        pause: async () => {},
      }),
    ).rejects.toThrow("Expected deployment revision not observed");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retries network propagation but preserves a terminal network error", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("DNS not ready"))
      .mockResolvedValueOnce(current());
    expect(
      (
        await releaseResponse("https://cheapseggs.com/", "current", {
          fetcher,
          pause: async () => {},
        })
      ).status,
    ).toBe(200);
    const failed = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });
    await expect(
      releaseResponse("https://cheapseggs.com/", "current", { fetcher: failed, attempts: 1 }),
    ).rejects.toThrow("network unavailable");
  });
});
