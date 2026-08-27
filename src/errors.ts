export class ThreadsApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly type?: string;

  constructor(message: string, status: number, code?: number, type?: string) {
    super(message);
    this.name = "ThreadsApiError";
    this.status = status;
    this.code = code;
    this.type = type;
  }
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; type?: string };
}

export function toApiError(status: number, body: unknown): ThreadsApiError {
  const error = (body as GraphErrorBody | null)?.error;
  const message = error?.message ?? `Threads API request failed with status ${status}`;
  return new ThreadsApiError(message, status, error?.code, error?.type);
}
