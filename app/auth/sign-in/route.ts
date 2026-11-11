import type { NextRequest } from "next/server";
import { safeReturnPath, signIn } from "@/lib/auth";

// A plain link starts the sign-in, so it works before any JavaScript has loaded.
// Auth.js answers with a redirect to Keycloak's login page.
export async function GET(request: NextRequest) {
  await signIn("keycloak", { redirectTo: safeReturnPath(request.nextUrl.searchParams.get("callbackUrl")) });
}
