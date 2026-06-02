import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";
import { PREVIEW } from "@/lib/preview";

const ERRORS: Record<string, string> = {
  AccessDenied:
    "このメールアドレスではログインできません。@instyle.group の管理者アカウントが必要です。心当たりがあれば admin に追加を依頼してください。",
  Verification:
    "リンクの有効期限が切れているか、すでに使用されています。もう一度メールアドレスを入力してマジックリンクを送り直してください。",
  Configuration:
    "サーバ側の設定を読み込めませんでした。ConoHa の /var/www/_shared/apps/app-claude-team-usage.env と Vercel の env を確認してください。",
};

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  if (PREVIEW) redirect("/");
  const session = await auth();
  if (session?.user) redirect("/");

  const { error, from } = await props.searchParams;
  const errorMsg = error ? ERRORS[error] ?? ERRORS.Configuration : null;

  return (
    <div className="login-card glass-panel">
      <h1 className="login-title">Claude Team Usage</h1>
      <p className="login-sub">
        instyle group の管理者のみログインできます。メールアドレスを入力すると、
        マジックリンクが届きます。
      </p>

      {errorMsg ? <p className="login-error">{errorMsg}</p> : null}

      <form
        action={async (formData: FormData) => {
          "use server";
          const email = String(formData.get("email") ?? "").trim();
          if (!email) return;
          await signIn("resend", {
            email,
            redirectTo: from || "/",
          });
        }}
      >
        <div className="field">
          <label htmlFor="email">メールアドレス</label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            placeholder="you@instyle.group"
            required
            autoComplete="email"
          />
        </div>
        <button className="btn btn--primary" type="submit" style={{ width: "100%" }}>
          マジックリンクを送る
        </button>
      </form>
    </div>
  );
}
