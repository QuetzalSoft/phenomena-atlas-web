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
 * API throws one with no status. A success without a body resolves to undefined.
 */
export async function call<T>(request: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result;
  try {
    result = await request();
  } catch {
    throw new RequestFailed(undefined, undefined);
  }
  // A success with no body, such as a 204, has no data and is still a success.
  if (result.data === undefined && !result.response.ok) {
    const details = (result.error as { details?: unknown } | undefined)?.details;
    throw new RequestFailed(
      result.response.status,
      errorCode(result.error),
      typeof details === "object" && details !== null ? (details as Record<string, unknown>) : undefined,
    );
  }
  return result.data as T;
}
