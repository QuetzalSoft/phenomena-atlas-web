import "server-only";
import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { createApi, type ApiClient } from ".";

export type Account = components["schemas"]["Account"];

/** Who is looking at the page, as the API sees them. */
export type Viewer =
  | { state: "anonymous" }
  /** Signed in here, but the API refused the token: it expired and could not be refreshed. */
  | { state: "expired" }
  /** Signed in, but the API could not say who they are. */
  | { state: "unknown"; name: string | undefined }
  | { state: "signed-in"; account: Account; api: ApiClient };

/**
 * The signed-in person and a client that calls the API as them. Cached per request, so the
 * header and the page share one call to the API.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await auth();
  if (!session) {
    return { state: "anonymous" };
  }
  if (!session.accessToken) {
    return { state: "expired" };
  }
  const api = createApi(session.accessToken);
  try {
    const { data, response } = await api.GET("/accounts/me", { cache: "no-store" });
    if (data) {
      return { state: "signed-in", account: data, api };
    }
    if (response.status === 401) {
      return { state: "expired" };
    }
  } catch {
    // The API is unreachable. The page says so rather than failing.
  }
  return { state: "unknown", name: session.user?.name ?? undefined };
});
