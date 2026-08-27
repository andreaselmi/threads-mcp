import { describe, expect, it, vi } from "vitest";
import { ThreadsClient } from "../src/client.js";
import { ThreadsApiError } from "../src/errors.js";
import type { ThreadsConfig } from "../src/config.js";

const config: ThreadsConfig = {
  accessToken: "token-123",
  userId: "me",
  apiBase: "https://graph.threads.net/v1.0",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ThreadsClient.whoami", () => {
  it("requests the profile fields for the configured user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "42", username: "acme" }));
    const client = new ThreadsClient(config, fetchMock);

    const profile = await client.whoami();

    expect(profile).toEqual({ id: "42", username: "acme" });
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://graph.threads.net/v1.0/me");
    expect(url.searchParams.get("fields")).toBe("id,username");
  });

  it("sends the token as a bearer header, never in the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "42", username: "acme" }));
    const client = new ThreadsClient(config, fetchMock);

    await client.whoami();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("token-123");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
  });

  it("turns a graph error into a ThreadsApiError with the api message", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { error: { message: "Invalid OAuth access token.", code: 190, type: "OAuthException" } },
          401,
        ),
      ),
    );
    const client = new ThreadsClient(config, fetchMock);

    await expect(client.whoami()).rejects.toBeInstanceOf(ThreadsApiError);
    await expect(client.whoami()).rejects.toThrow("Invalid OAuth access token.");
  });

  it("uses an explicit user id in the path when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "987", username: "acme" }));
    const client = new ThreadsClient({ ...config, userId: "987" }, fetchMock);

    await client.whoami();

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/987");
  });
});

describe("ThreadsClient.publishText", () => {
  const noSleep = { sleep: async () => {} };

  function publishMocks() {
    return vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-1", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-1" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "post-1", permalink: "https://www.threads.net/@acme/post/abc" }),
      );
  }

  it("creates a text container and then publishes it", async () => {
    const fetchMock = publishMocks();
    const client = new ThreadsClient(config, fetchMock, noSleep);

    const post = await client.publishText("ciao");

    const first = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(first.pathname).toBe("/v1.0/me/threads");
    expect(first.searchParams.get("media_type")).toBe("TEXT");
    expect(first.searchParams.get("text")).toBe("ciao");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("POST");

    const second = new URL(fetchMock.mock.calls[2]![0] as string);
    expect(second.pathname).toBe("/v1.0/me/threads_publish");
    expect(second.searchParams.get("creation_id")).toBe("container-1");

    expect(post.id).toBe("post-1");
  });

  it("returns the permalink of the published post", async () => {
    const client = new ThreadsClient(config, publishMocks(), noSleep);

    const post = await client.publishText("ciao");

    expect(post.permalink).toBe("https://www.threads.net/@acme/post/abc");
  });

  it("passes reply_to_id when replying", async () => {
    const fetchMock = publishMocks();
    const client = new ThreadsClient(config, fetchMock, noSleep);

    await client.publishText("ciao", { replyToId: "post-0" });

    const first = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(first.searchParams.get("reply_to_id")).toBe("post-0");
  });

  it("rejects empty text before touching the network", async () => {
    const fetchMock = vi.fn();
    const client = new ThreadsClient(config, fetchMock, noSleep);

    await expect(client.publishText("   ")).rejects.toThrow(/empty/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects text longer than 500 characters before touching the network", async () => {
    const fetchMock = vi.fn();
    const client = new ThreadsClient(config, fetchMock, noSleep);

    await expect(client.publishText("a".repeat(501))).rejects.toThrow(/500/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still returns the post id when the permalink lookup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-1", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-1" }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "not ready" } }, 400));
    const client = new ThreadsClient(config, fetchMock, noSleep);

    const post = await client.publishText("ciao");

    expect(post).toEqual({ id: "post-1" });
  });

  it("returns the published text read back from the lookup response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-1", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "post-1",
          permalink: "https://www.threads.net/@acme/post/abc",
          text: "ciao",
        }),
      );
    const client = new ThreadsClient(config, fetchMock, noSleep);

    const post = await client.publishText("ciao");

    expect(post.text).toBe("ciao");
    const lookup = new URL(fetchMock.mock.calls[3]![0] as string);
    expect(lookup.searchParams.get("fields")).toBe("id,permalink,text");
  });

  it("waits for the container to be FINISHED before publishing it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-1", status: "IN_PROGRESS" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-1", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-1" }));
    const client = new ThreadsClient(config, fetchMock, noSleep);

    await client.publishText("ciao");

    const status = new URL(fetchMock.mock.calls[1]![0] as string);
    expect(status.pathname).toBe("/v1.0/container-1");
    expect(status.searchParams.get("fields")).toBe("status,error_message");

    const publish = new URL(fetchMock.mock.calls[3]![0] as string);
    expect(publish.pathname).toBe("/v1.0/me/threads_publish");
    expect(publish.searchParams.get("creation_id")).toBe("container-1");
  });

  it("never calls threads_publish when the container comes back in ERROR", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-1" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "container-1", status: "ERROR", error_message: "UNKNOWN" }),
      );
    const client = new ThreadsClient(config, fetchMock, noSleep);

    await expect(client.publishText("ciao")).rejects.toThrow(/UNKNOWN/);

    const paths = fetchMock.mock.calls.map((call) => new URL(call[0] as string).pathname);
    expect(paths).not.toContain("/v1.0/me/threads_publish");
  });

  it("gives up after the wait window with an error carrying the container id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-1" }))
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ id: "container-1", status: "IN_PROGRESS" })),
      );
    const client = new ThreadsClient(config, fetchMock, noSleep);

    await expect(client.publishText("ciao")).rejects.toThrow(/container-1/);
  });

  it("rethrows a recoverable error carrying the container id when publish fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-1", status: "FINISHED" }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "Media ID is not available" } }, 400),
      );
    const client = new ThreadsClient(config, fetchMock, noSleep);

    let caught: unknown;
    try {
      await client.publishText("ciao");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toMatch(/container-1/);
    expect(message).toMatch(/Media ID is not available/);
  });
});

describe("ThreadsClient.publishContainer", () => {
  const noSleep = { sleep: async () => {} };

  it("publishes a container that already exists without creating a new one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-9", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-9" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "post-9", permalink: "https://www.threads.net/@acme/post/xyz" }),
      );
    const client = new ThreadsClient(config, fetchMock, noSleep);

    const post = await client.publishContainer("container-9");

    const paths = fetchMock.mock.calls.map((call) => new URL(call[0] as string).pathname);
    expect(paths).not.toContain("/v1.0/me/threads");

    const publish = new URL(fetchMock.mock.calls[1]![0] as string);
    expect(publish.searchParams.get("creation_id")).toBe("container-9");
    expect(post).toEqual({ id: "post-9", permalink: "https://www.threads.net/@acme/post/xyz" });
  });

  it("waits for a container that is still in progress", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-9", status: "IN_PROGRESS" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-9", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-9" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-9" }));
    const client = new ThreadsClient(config, fetchMock, noSleep);

    const post = await client.publishContainer("container-9");

    expect(post.id).toBe("post-9");
  });
});

describe("ThreadsClient reads", () => {
  it("lists recent posts with their fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: "1", text: "primo", timestamp: "2026-08-20T10:00:00+0000", permalink: "https://x/1" },
        ],
      }),
    );
    const client = new ThreadsClient(config, fetchMock);

    const posts = await client.listPosts();

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me/threads");
    expect(url.searchParams.get("fields")).toBe("id,text,timestamp,permalink");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.text).toBe("primo");
  });

  it("caps the requested limit at 100", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new ThreadsClient(config, fetchMock);

    await client.listPosts(500);

    expect(new URL(fetchMock.mock.calls[0]![0] as string).searchParams.get("limit")).toBe("100");
  });

  it("returns an empty array when the response has no data", async () => {
    const client = new ThreadsClient(config, vi.fn().mockResolvedValue(jsonResponse({})));

    expect(await client.listPosts()).toEqual([]);
  });

  it("flattens post insights into a name to value map", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { name: "views", values: [{ value: 120 }] },
          { name: "likes", values: [{ value: 7 }] },
        ],
      }),
    );
    const client = new ThreadsClient(config, fetchMock);

    const insights = await client.postInsights("post-1");

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/post-1/insights");
    expect(url.searchParams.get("metric")).toBe("views,likes,replies,reposts,quotes");
    expect(insights).toEqual({ views: 120, likes: 7 });
  });

  it("reports the remaining publishing quota", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ quota_usage: 3, config: { quota_total: 250 } }] }),
    );
    const client = new ThreadsClient(config, fetchMock);

    const limit = await client.publishingLimit();

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me/threads_publishing_limit");
    expect(limit).toEqual({ used: 3, quota: 250, remaining: 247 });
  });
});
