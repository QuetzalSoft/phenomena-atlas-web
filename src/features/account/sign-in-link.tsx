"use client";

import { usePathname } from "next/navigation";
import ui from "@/components/ui.module.css";

/** Signs in and comes back to `returnTo`, or to the page it was clicked on. */
export function SignInLink({ label = "Sign in", returnTo }: { label?: string; returnTo?: string }) {
  const pathname = usePathname();
  const callbackUrl = returnTo ?? pathname;
  // A plain link, not next/link: the route answers with a redirect to Keycloak.
  return (
    <a className={ui.button} href={`/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
      {label}
    </a>
  );
}
