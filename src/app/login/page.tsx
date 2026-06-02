import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";
import { PREVIEW } from "@/lib/preview";

const ERRORS: Record<string, string> = {
  WrongPassword: "パスワードが違います。",
  CredentialsSignin: "パスワードが違います。",
  Configuration:
    "サーバ側の設定を読み込めませんでした。/var/www/_shared/apps/app-claude-team-usage.env の ADMIN_PASSWORD_HASH と AUTH_SECRET を確認してください。",
};

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  if (PREVIEW) redirect("/");
  const session = await auth();
  if (session?.user) redirect("/");

  const { error, from } = await props.searchParams;
  const errorMsg = error ? (ERRORS[error] ?? ERRORS.Configuration) : null;

  return (
    <div className="login-card glass-panel">
      <h1 className="login-title">Claude Team Usage</h1>
      <p className="login-sub">instyle group 管理者用ダッシュボード。共通パスワードでログインしてください。</p>

      {errorMsg ? <p className="login-error">{errorMsg}</p> : null}

      <form
        action={async (formData: FormData) => {
          "use server";
          const password = String(formData.get("password") ?? "");
          if (!password) return;
          await signIn("credentials", {
            password,
            redirectTo: from || "/",
          });
        }}
      >
        <div className="field">
          <label htmlFor="password">パスワード</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            autoFocus
          />
        </div>
        <button className="btn btn--primary" type="submit" style={{ width: "100%" }}>
          ログイン
        </button>
      </form>
    </div>
  );
}
