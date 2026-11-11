import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { keycloakIssuer, signOut } from "@/lib/auth";

// Ends both sessions: this site's cookie, then Keycloak's own. Without the second, the next
// sign-in would go straight through without asking for a password.
export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: request.nextUrl.protocol === "https:",
  });
  await signOut({ redirect: false });

  const home = new URL("/", request.nextUrl.origin).href;
  if (!keycloakIssuer) {
    return NextResponse.redirect(home, 303);
  }
  const logout = new URL(`${keycloakIssuer}/protocol/openid-connect/logout`);
  logout.searchParams.set("post_logout_redirect_uri", home);
  if (token?.idToken) {
    logout.searchParams.set("id_token_hint", token.idToken);
  } else if (process.env.AUTH_KEYCLOAK_ID) {
    logout.searchParams.set("client_id", process.env.AUTH_KEYCLOAK_ID);
  }
  return NextResponse.redirect(logout, 303);
}
