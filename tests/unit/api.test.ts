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
  it("redirects only to fixed canonical public paths and the apex", async () => {
    const alias = await app.request("https://cheapseggs.com/chemistry?campaign=example");
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe("/chemistry/?campaign=example");
    const www = await app.request("https://www.cheapseggs.com/wheel/");
    expect(www.status).toBe(308);
    expect(www.headers.get("location")).toBe("https://cheapseggs.com/wheel/");
    expect(
      (await app.request("https://www.cheapseggs.com/api/auth/sign-in", { method: "POST" })).status,
    ).toBe(400);
  });
  it("exposes release metadata without cookies or secrets", async () => {
    const response = await app.request("/api/version");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "cheapseggs",
      revision: "local",
      workerVersion: null,
      environment: "local",
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
