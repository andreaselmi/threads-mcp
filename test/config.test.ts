import { describe, expect, it } from "vitest";
import { API_BASE, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("reads the access token from the environment", () => {
    const config = loadConfig({ THREADS_ACCESS_TOKEN: "token-123" });
    expect(config.accessToken).toBe("token-123");
  });

  it("defaults the user id to me", () => {
    const config = loadConfig({ THREADS_ACCESS_TOKEN: "token-123" });
    expect(config.userId).toBe("me");
  });

  it("uses an explicit user id when provided", () => {
    const config = loadConfig({
      THREADS_ACCESS_TOKEN: "token-123",
      THREADS_USER_ID: "987",
    });
    expect(config.userId).toBe("987");
  });

  it("defaults the api base to the Threads graph host", () => {
    const config = loadConfig({ THREADS_ACCESS_TOKEN: "token-123" });
    expect(config.apiBase).toBe(API_BASE);
  });

  it("throws a readable error when the token is missing", () => {
    expect(() => loadConfig({})).toThrow(/THREADS_ACCESS_TOKEN/);
  });

  it("treats a blank token as missing", () => {
    expect(() => loadConfig({ THREADS_ACCESS_TOKEN: "   " })).toThrow(/THREADS_ACCESS_TOKEN/);
  });
});
