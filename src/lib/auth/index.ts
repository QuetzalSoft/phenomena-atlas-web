import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Keycloak from "next-auth/providers/keycloak";

// Sign-in goes through Keycloak with the authorization code flow and PKCE (ADR 0008 in the
// system repository). The tokens live in Auth.js's encrypted, httpOnly session cookie. Only
// the access token is handed to the browser; the refresh and ID tokens never leave the
// server. See docs/architecture.md, "Authentication".

/** Refresh this long before the access token expires, so a request never carries a stale one. */
const refreshMarginSeconds = 30;

declare module "next-auth" {
  interface Session {
    /** Sent as the Bearer token to the API. Absent when the session could not be refreshed. */
    accessToken?: string;
    /** Set when the tokens could not be refreshed; the person has to sign in again. */
    error?: "RefreshTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    /** Seconds since the epoch. */
    expiresAt?: number;
    refreshToken?: string;
    /** Kept for Keycloak's logout, which skips its confirmation page when it gets one. */
    idToken?: string;
    error?: "RefreshTokenError";
  }
}

/** The Keycloak realm URL, such as http://localhost:8080/realms/phenomena-atlas. */
export const keycloakIssuer = process.env.AUTH_KEYCLOAK_ISSUER;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      issuer: keycloakIssuer,
      // The web client is public in Keycloak: no secret, PKCE instead.
      client: { token_endpoint_auth_method: "none" },
      checks: ["pkce", "state"],
    }),
  ],
  pages: { error: "/auth/error" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          expiresAt: account.expires_at,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
          error: undefined,
        };
      }
      if (token.error || !token.expiresAt || Date.now() / 1000 < token.expiresAt - refreshMarginSeconds) {
        return token;
      }
      return refresh(token);
    },
    session({ session, token }) {
      session.accessToken = token.error ? undefined : token.accessToken;
      session.error = token.error;
      return session;
    },
  },
});

async function refresh(token: JWT): Promise<JWT> {
  if (!token.refreshToken || !keycloakIssuer || !process.env.AUTH_KEYCLOAK_ID) {
    return { ...token, error: "RefreshTokenError" };
  }
  try {
    // This talks to Keycloak, not to the API, so the typed API client does not apply.
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(`${keycloakIssuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.AUTH_KEYCLOAK_ID,
        refresh_token: token.refreshToken,
      }),
      cache: "no-store",
    });
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      id_token?: string;
    };
    if (!response.ok || !body.access_token || !body.expires_in) {
      return { ...token, error: "RefreshTokenError" };
    }
    return {
      ...token,
      accessToken: body.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
      // Keycloak may rotate the refresh token. Keep the old one when it does not.
      refreshToken: body.refresh_token ?? token.refreshToken,
      idToken: body.id_token ?? token.idToken,
    };
  } catch {
    return { ...token, error: "RefreshTokenError" };
  }
}

/** A same-site path to return to after signing in. Anything else falls back to the home page. */
export function safeReturnPath(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
