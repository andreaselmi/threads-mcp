import { describe, expect, it } from "vitest";
import { API_BASE } from "../src/config.js";

describe("toolchain", () => {
  it("exposes the Threads API base url", () => {
    expect(API_BASE).toBe("https://graph.threads.net/v1.0");
  });
});
