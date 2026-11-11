import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { paths } from "@quetzalsoft/phenomena-atlas-contract";

/** Where this side reaches the API. The server and the browser may use different addresses. */
export const apiBaseUrl =
  typeof window === "undefined" ? process.env.API_URL : process.env.NEXT_PUBLIC_API_URL;

export const api = createClient<paths>({ baseUrl: apiBaseUrl });

export const $api = createQueryClient(api);
