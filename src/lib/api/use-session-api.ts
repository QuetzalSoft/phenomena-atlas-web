"use client";

import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { createApi } from ".";

/** A client that calls the API as the signed-in person, from the browser. */
export function useSessionApi() {
  const { data: session } = useSession();
  const accessToken = session?.accessToken;
  return useMemo(() => createApi(accessToken), [accessToken]);
}
