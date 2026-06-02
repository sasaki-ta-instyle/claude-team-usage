const RAW = process.env.ADMIN_EMAILS ?? "";

const parsed = RAW.split(",")
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s.length > 0);

export const ADMIN_EMAILS: ReadonlySet<string> = new Set(parsed);
export const ADMIN_EMAIL_LIST: readonly string[] = parsed;

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  if (!e.endsWith("@instyle.group")) return false;
  return ADMIN_EMAILS.has(e);
}
