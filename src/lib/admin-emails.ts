// Kept as a vestigial helper for compatibility — the project switched from
// email allowlist to a shared admin password. Always returns false so any
// remaining caller short-circuits to "non-admin" if reached.
export const ADMIN_EMAILS: ReadonlySet<string> = new Set();
export const ADMIN_EMAIL_LIST: readonly string[] = [];

export function isAdminEmail(_email: string | null | undefined): boolean {
  return false;
}
