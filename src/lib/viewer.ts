import { auth } from "@/lib/auth";
import { PREVIEW } from "@/lib/preview";

// 閲覧は誰でも可（URL を知っていれば見られる公開ダッシュボード）。
// 書き込み（ロスター CSV 取り込み / tier 編集）だけ管理者ログインが必要。
// stale JWT（旧 AUTH_SECRET 署名）でも落ちないよう、失敗は未ログイン扱い。
export async function isAdminViewer(): Promise<boolean> {
  if (PREVIEW) return true;
  const session = await auth().catch(() => null);
  return Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
}
