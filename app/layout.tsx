import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NavLink } from "@/components/nav-link";
import { SiteHeader } from "@/components/site-header";
import { AccountMenu } from "@/features/account/account-menu";
import { auth } from "@/lib/auth";
import { getViewer } from "@/lib/api/server";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Phenomena Atlas", template: "%s - Phenomena Atlas" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [session, viewer] = await Promise.all([auth(), getViewer()]);
  const signedIn = viewer.state === "signed-in";
  const isAdmin = signedIn && viewer.account.role === "admin";

  return (
    <html lang="en">
      <body>
        <Providers session={session}>
          <SiteHeader
            nav={
              <>
                <NavLink href="/dashboard">System status</NavLink>
                {signedIn && <NavLink href="/reports/new">File a report</NavLink>}
                {signedIn && <NavLink href="/reports/mine">My reports</NavLink>}
                {isAdmin && <NavLink href="/admin/accounts">Accounts</NavLink>}
                {isAdmin && <NavLink href="/admin/regions">Regions</NavLink>}
                {isAdmin && <NavLink href="/admin/phenomena">Phenomena</NavLink>}
              </>
            }
            account={<AccountMenu />}
          />
          {children}
        </Providers>
      </body>
    </html>
  );
}
