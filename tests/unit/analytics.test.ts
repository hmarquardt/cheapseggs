import { describe, expect, it } from "vitest";
import { analyticsPayload, collectionAllowed, publicPath } from "../../src/client/analytics";

const approved = {
  consent: "granted",
  doNotTrack: null,
  globalPrivacyControl: false,
  hostname: "cheapseggs.com",
  pathname: "/",
};
describe("minimal CFLab contract", () => {
  it("requires affirmative permission, canonical host and public route", () => {
    expect(collectionAllowed(approved)).toBe(true);
    for (const change of [
      { consent: null },
      { consent: "denied" },
      { doNotTrack: "1" },
      { globalPrivacyControl: true },
      { hostname: "localhost" },
      { pathname: "/play/" },
      { pathname: "/invite/private-token" },
    ]) {
      expect(collectionAllowed({ ...approved, ...change })).toBe(false);
    }
  });
  it("rejects full URLs, query strings and private identifiers instead of sanitizing unknown input", () => {
    for (const value of [
      "/?answer=private",
      "/chemistry/result/abc",
      "https://cheapseggs.com/",
      "/results/id",
      "/play/",
    ])
      expect(publicPath(value)).toBeNull();
  });
  it("serializes only public identifiers, fixed paths and event names", () => {
    const body = analyticsPayload("/chemistry/", "pageview", "pageview");
    expect(Object.keys(body).sort()).toEqual(["event_uid", "kind", "name", "path", "site"]);
    expect(body.site).toBe("as_v3ng10kbDYMLWnFWOsf52W");
    expect(body.path).toBe("/chemistry/");
    expect(body.name).toBe("pageview");
    expect(() => analyticsPayload("/", "event", "private_answer")).toThrow();
  });
});
