import { handlers } from "@/lib/auth";

// Auth.js's own endpoints: the OAuth callback, the session, CSRF. No domain data.
export const { GET, POST } = handlers;
