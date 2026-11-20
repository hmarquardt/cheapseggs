import { describe, expect, it } from "vitest";
import { app } from "../../src/server";

describe("foundation API boundary", () => {
  it("exposes liveness without account or database information", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "cheapseggs",
      stage: "foundation",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
  it("fails closed for authentication and billing", async () => {
    expect((await app.request("/api/auth/sign-in", { method: "POST" })).status).toBe(503);
    expect((await app.request("/api/payments/webhook", { method: "POST" })).status).toBe(503);
    expect((await app.request("/api/v1/couples/other/preferences")).status).toBe(404);
  });
  it("readiness fails without an initialized database", async () => {
    expect((await app.request("/api/ready")).status).toBe(503);
  });
});
