export const API_BASE = "https://graph.threads.net/v1.0";

export interface ThreadsConfig {
  accessToken: string;
  userId: string;
  apiBase: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ThreadsConfig {
  const accessToken = env.THREADS_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new Error(
      "THREADS_ACCESS_TOKEN is not set. Export a long-lived Threads token before starting the server; see this package's README.",
    );
  }

  const userId = env.THREADS_USER_ID?.trim() || "me";
  const apiBase = env.THREADS_API_BASE?.trim() || API_BASE;

  return { accessToken, userId, apiBase };
}
