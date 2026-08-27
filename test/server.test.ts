import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import type { ThreadsClient } from "../src/client.js";

function fakeClient(overrides: Partial<ThreadsClient> = {}): ThreadsClient {
  return {
    whoami: vi.fn().mockResolvedValue({ id: "42", username: "acme" }),
    publishText: vi.fn().mockResolvedValue({ id: "post-1", permalink: "https://x/1" }),
    publishContainer: vi.fn().mockResolvedValue({ id: "post-9", permalink: "https://x/9" }),
    listPosts: vi.fn().mockResolvedValue([{ id: "1", text: "primo" }]),
    postInsights: vi.fn().mockResolvedValue({ views: 120 }),
    publishingLimit: vi.fn().mockResolvedValue({ used: 3, quota: 250, remaining: 247 }),
    ...overrides,
  } as unknown as ThreadsClient;
}

async function connect(client: ThreadsClient) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    createServer(client).connect(serverTransport),
    mcpClient.connect(clientTransport),
  ]);
  return mcpClient;
}

describe("createServer", () => {
  it("exposes exactly the six platform tools", async () => {
    const mcpClient = await connect(fakeClient());

    const { tools } = await mcpClient.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "threads_list_posts",
      "threads_post_insights",
      "threads_publish_container",
      "threads_publish_text",
      "threads_publishing_limit",
      "threads_whoami",
    ]);
  });

  it("publishes text and reports the permalink", async () => {
    const threads = fakeClient();
    const mcpClient = await connect(threads);

    const result = await mcpClient.callTool({
      name: "threads_publish_text",
      arguments: { text: "ciao" },
    });

    expect(threads.publishText).toHaveBeenCalledWith("ciao", {});
    expect(JSON.stringify(result.content)).toContain("https://x/1");
  });

  it("publishes an already created container through its own tool", async () => {
    const threads = fakeClient();
    const mcpClient = await connect(threads);

    const result = await mcpClient.callTool({
      name: "threads_publish_container",
      arguments: { container_id: "container-9" },
    });

    expect(threads.publishContainer).toHaveBeenCalledWith("container-9");
    expect(JSON.stringify(result.content)).toContain("https://x/9");
  });

  it("passes reply_to_id through when replying", async () => {
    const threads = fakeClient();
    const mcpClient = await connect(threads);

    await mcpClient.callTool({
      name: "threads_publish_text",
      arguments: { text: "ciao", reply_to_id: "post-0" },
    });

    expect(threads.publishText).toHaveBeenCalledWith("ciao", { replyToId: "post-0" });
  });

  it("returns a tool error instead of throwing when the api fails", async () => {
    const threads = fakeClient({
      publishText: vi.fn().mockRejectedValue(new Error("Invalid OAuth access token.")),
    });
    const mcpClient = await connect(threads);

    const result = await mcpClient.callTool({
      name: "threads_publish_text",
      arguments: { text: "ciao" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Invalid OAuth access token.");
  });

  it("reads the requested number of posts", async () => {
    const threads = fakeClient();
    const mcpClient = await connect(threads);

    await mcpClient.callTool({ name: "threads_list_posts", arguments: { limit: 5 } });

    expect(threads.listPosts).toHaveBeenCalledWith(5);
  });

  it("reads insights for a post", async () => {
    const threads = fakeClient();
    const mcpClient = await connect(threads);

    const result = await mcpClient.callTool({
      name: "threads_post_insights",
      arguments: { post_id: "post-1" },
    });

    expect(threads.postInsights).toHaveBeenCalledWith("post-1");
    expect(JSON.stringify(result.content)).toContain("120");
  });
});
