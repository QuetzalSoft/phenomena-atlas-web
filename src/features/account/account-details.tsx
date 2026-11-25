"use client";

import type { components } from "@quetzalsoft/phenomena-atlas-contract";
import { useRouter } from "next/navigation";
import { call } from "@/lib/api/request";
import { useSessionApi } from "@/lib/api/use-session-api";
import { ProfileForm } from "./profile-form";

type Account = components["schemas"]["Account"];

/** The signed-in person's own details, which they can edit. */
export function AccountDetails({ account }: { account: Account }) {
  const api = useSessionApi();
  const router = useRouter();

  return (
    <ProfileForm
      testId="account-form"
      account={account}
      save={async (values) => {
        const updated = await call(() => api.PUT("/accounts/me/profile", { body: values }));
        // The header shows the name, and the server renders it: ask for the page again.
        router.refresh();
        return updated;
      }}
    />
  );
}
