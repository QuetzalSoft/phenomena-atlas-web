"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useState, type ReactNode } from "react";

/** How often the browser asks for the session, which also refreshes an expiring access token. */
const sessionRefetchSeconds = 60;

export function Providers({ session, children }: { session: Session | null; children: ReactNode }) {
  // One client per browser session, created once so state survives re-renders.
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SessionProvider session={session} refetchInterval={sessionRefetchSeconds}>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </QueryClientProvider>
    </SessionProvider>
  );
}
