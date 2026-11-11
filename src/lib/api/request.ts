import { errorCode } from ".";

/** A failed call, reduced to what the copy depends on: its status, its code and its details. */
export class RequestFailed extends Error {
  constructor(
    readonly status: number | undefined,
    readonly code: string | undefined,
    readonly details?: Record<string, unknown>,
  ) {
    super(code ?? `HTTP ${status ?? "unreachable"}`);
  }
}

/**
 * Runs an openapi-fetch call and returns its data, or throws RequestFailed. An unreachable
 * API throws one with no status.
 */
export async function call<T>(request: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result;
  try {
    result = await request();
  } catch {
    throw new RequestFailed(undefined, undefined);
  }
  if (result.data === undefined) {
    const details = (result.error as { details?: unknown } | undefined)?.details;
    throw new RequestFailed(
      result.response.status,
      errorCode(result.error),
      typeof details === "object" && details !== null ? (details as Record<string, unknown>) : undefined,
    );
  }
  return result.data;
}
