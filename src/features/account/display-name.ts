/** The most human name an account has. Absent when it has never signed in. */
export function displayName(account: { name?: string; username?: string; email?: string }): string | undefined {
  return account.name ?? account.username ?? account.email;
}
