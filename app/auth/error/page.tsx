import type { Metadata } from "next";
import ui from "@/components/ui.module.css";
import { SignInLink } from "@/features/account/sign-in-link";

export const metadata: Metadata = { title: "Sign-in failed" };

export default function SignInErrorPage() {
  return (
    <main className={ui.page}>
      <p className={ui.eyebrow}>Phenomena Atlas</p>
      <h1 className={ui.title}>Sign-in did not complete</h1>
      <p className={ui.lead}>
        The identity provider could not confirm who you are, or the sign-in took too long. Try again.
      </p>
      <p className={ui.lead}>
        <SignInLink label="Try again" returnTo="/" />
      </p>
    </main>
  );
}
