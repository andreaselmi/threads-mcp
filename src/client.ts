import type { ThreadsConfig } from "./config.js";
import { toApiError } from "./errors.js";

export interface ThreadsProfile {
  id: string;
  username: string;
}

export const MAX_POST_LENGTH = 500;

export interface PublishedPost {
  id: string;
  permalink?: string;
  text?: string;
}

export interface ThreadsPost {
  id: string;
  text?: string;
  timestamp?: string;
  permalink?: string;
}

export interface PublishingLimit {
  used: number;
  quota: number;
  remaining: number;
}

const CONTAINER_POLL_INTERVAL_MS = 2000;
const CONTAINER_POLL_ATTEMPTS = 30;

export interface ThreadsClientOptions {
  sleep?: (ms: number) => Promise<void>;
}

export class ThreadsClient {
  private readonly config: ThreadsConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    config: ThreadsConfig,
    fetchImpl: typeof fetch = fetch,
    options: ThreadsClientOptions = {},
  ) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.sleep =
      options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private async waitUntilReady(containerId: string): Promise<void> {
    for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await this.sleep(CONTAINER_POLL_INTERVAL_MS);

      const container = await this.request<{ status?: string; error_message?: string }>(
        "GET",
        `/${containerId}`,
        { fields: "status,error_message" },
      );

      if (container.status === "FINISHED" || container.status === "PUBLISHED") return;

      if (container.status === "ERROR" || container.status === "EXPIRED") {
        throw new Error(
          `Threads could not process container ${containerId}: ${container.status}` +
            `${container.error_message ? ` (${container.error_message})` : ""}.`,
        );
      }
    }

    throw new Error(
      `Container ${containerId} was still not ready after ` +
        `${Math.round((CONTAINER_POLL_INTERVAL_MS * (CONTAINER_POLL_ATTEMPTS - 1)) / 1000)}s. ` +
        `It stays valid for 24 hours: publish it with this container id instead of creating a new one.`,
    );
  }

  async whoami(): Promise<ThreadsProfile> {
    return await this.request<ThreadsProfile>("GET", this.userPath(), {
      fields: "id,username",
    });
  }

  async publishText(
    text: string,
    options: { replyToId?: string } = {},
  ): Promise<PublishedPost> {
    const body = text.trim();
    if (!body) throw new Error("Cannot publish an empty post.");
    if (body.length > MAX_POST_LENGTH) {
      throw new Error(
        `Post is ${body.length} characters, the Threads limit is ${MAX_POST_LENGTH}.`,
      );
    }

    const container = await this.request<{ id: string }>("POST", this.userPath("/threads"), {
      media_type: "TEXT",
      text: body,
      reply_to_id: options.replyToId,
    });

    return await this.publishContainer(container.id);
  }

  async publishContainer(containerId: string): Promise<PublishedPost> {
    await this.waitUntilReady(containerId);

    let published: { id: string };
    try {
      published = await this.request<{ id: string }>(
        "POST",
        this.userPath("/threads_publish"),
        { creation_id: containerId },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${message} (container id ${containerId} exists but publishing it failed; publish it again with threads_publish_container using this id, instead of creating a new one)`,
      );
    }

    try {
      const details = await this.request<{ id: string; permalink?: string; text?: string }>(
        "GET",
        `/${published.id}`,
        { fields: "id,permalink,text" },
      );
      return {
        id: published.id,
        ...(details.permalink ? { permalink: details.permalink } : {}),
        ...(details.text !== undefined ? { text: details.text } : {}),
      };
    } catch {
      return { id: published.id };
    }
  }

  async listPosts(limit = 10): Promise<ThreadsPost[]> {
    const capped = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const response = await this.request<{ data?: ThreadsPost[] }>(
      "GET",
      this.userPath("/threads"),
      { fields: "id,text,timestamp,permalink", limit: capped },
    );
    return response.data ?? [];
  }

  async postInsights(postId: string): Promise<Record<string, number>> {
    const response = await this.request<{
      data?: { name: string; values?: { value?: number }[] }[];
    }>("GET", `/${postId}/insights`, { metric: "views,likes,replies,reposts,quotes" });

    const insights: Record<string, number> = {};
    for (const metric of response.data ?? []) {
      const value = metric.values?.[0]?.value;
      if (typeof value === "number") insights[metric.name] = value;
    }
    return insights;
  }

  async publishingLimit(): Promise<PublishingLimit> {
    const response = await this.request<{
      data?: { quota_usage?: number; config?: { quota_total?: number } }[];
    }>("GET", this.userPath("/threads_publishing_limit"), {
      fields: "quota_usage,config",
    });

    const entry = response.data?.[0];
    const used = entry?.quota_usage ?? 0;
    const quota = entry?.config?.quota_total ?? 250;
    return { used, quota, remaining: Math.max(quota - used, 0) };
  }

  protected userPath(suffix = ""): string {
    return `/${this.config.userId}${suffix}`;
  }

  protected async request<T>(
    method: "GET" | "POST",
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(this.config.apiBase + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await this.fetchImpl(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        Accept: "application/json",
      },
    });

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw toApiError(response.status, body);
    return body as T;
  }
}
