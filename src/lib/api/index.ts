import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "@quetzalsoft/phenomena-atlas-contract";

/** Where this side reaches the API. The server and the browser may use different addresses. */
export const apiBaseUrl =
  typeof window === "undefined" ? process.env.API_URL : process.env.NEXT_PUBLIC_API_URL;

export type ApiClient = ReturnType<typeof createApi>;
export type ApiError = components["schemas"]["Error"];

/**
 * A client for one caller. With a token, every request carries it as the Bearer token.
 * On the server, create one per request: a shared client would send one person's token
 * with another person's request.
 */
export function createApi(accessToken?: string) {
  const client = createClient<paths>({ baseUrl: apiBaseUrl });
  if (accessToken) {
    client.use({
      onRequest({ request }) {
        request.headers.set("Authorization", `Bearer ${accessToken}`);
      },
    });
  }
  return client;
}

/** The anonymous client, for operations open to everyone. */
export const api = createApi();

export const $api = createQueryClient(api);

/** Failures come back as the contract's Error shape. Only its code is meant for client logic. */
export function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}
