import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ThreadsClient } from "./client.js";
import { MAX_POST_LENGTH } from "./client.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function fail(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

async function run(operation: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await operation());
  } catch (error) {
    return fail(error);
  }
}

export function createServer(client: ThreadsClient): McpServer {
  const server = new McpServer({ name: "threads-mcp", version: "0.1.0" });

  server.registerTool(
    "threads_whoami",
    {
      title: "Threads identity",
      description: "Return the id and username of the connected Threads account.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => client.whoami()),
  );

  server.registerTool(
    "threads_publish_text",
    {
      title: "Publish a text post",
      description:
        `Publish a text post on the connected Threads account. Max ${MAX_POST_LENGTH} characters. This is irreversible: the post goes live immediately.`,
      inputSchema: {
        text: z.string().min(1).max(MAX_POST_LENGTH).describe("The exact text to publish."),
        reply_to_id: z.string().optional().describe("Id of the post being replied to."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ text, reply_to_id }) =>
      run(() => client.publishText(text, reply_to_id ? { replyToId: reply_to_id } : {})),
  );

  server.registerTool(
    "threads_publish_container",
    {
      title: "Publish an already created container",
      description:
        "Publish a Threads container that was already created but never published, using its container id. Use this to recover a publish that failed after the container was created: the container stays valid for 24 hours, and publishing it again this way avoids posting the same text twice.",
      inputSchema: {
        container_id: z
          .string()
          .min(1)
          .describe("Id of the container to publish, as reported by the failed publish."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ container_id }) => run(() => client.publishContainer(container_id)),
  );

  server.registerTool(
    "threads_list_posts",
    {
      title: "List own posts",
      description: "Read the most recent posts of the connected account.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(10).describe("How many posts to read."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => run(() => client.listPosts(limit)),
  );

  server.registerTool(
    "threads_post_insights",
    {
      title: "Post insights",
      description: "Read views, likes, replies, reposts and quotes for one own post.",
      inputSchema: { post_id: z.string().describe("Id of the post.") },
      annotations: { readOnlyHint: true },
    },
    async ({ post_id }) => run(() => client.postInsights(post_id)),
  );

  server.registerTool(
    "threads_publishing_limit",
    {
      title: "Publishing quota",
      description: "Read how much of the 24h publishing quota is still available.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => client.publishingLimit()),
  );

  return server;
}
