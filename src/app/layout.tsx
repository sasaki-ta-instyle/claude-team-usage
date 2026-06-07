import type { Metadata } from "next";

import { auth, signOut } from "@/lib/auth";
import { PREVIEW } from "@/lib/preview";
import { AppNav } from "./_nav";
import "./globals.css";

const SITE_URL = "https://app.instyle.group/claude-team-usage";
const ASSETS = "https://app.instyle.group/_shared/static";
const TITLE = "Claude Team Usage / instyle.group";
const DESCRIPTION =
  "instyle group の Claude Team プラン使用量を可視化し、Premium / Standard の配分を判断する管理ダッシュボード";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: `${ASSETS}/favicon.png`, apple: `${ASSETS}/favicon.png` },
  openGraph: {
    type: "website",
    siteName: "INSTYLE GROUP",
    locale: "ja_JP",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${ASSETS}/ogp.jpg`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${ASSETS}/ogp.jpg`],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // stale JWT (旧 AUTH_SECRET で署名されたクッキー) を持つ訪問者でも落ちないよう
  // session 取得に失敗したら未ログイン扱いで続行する。
  const session = PREVIEW ? null : await auth().catch(() => null);
  const isLoggedIn = PREVIEW || !!session?.user;
  const headerName = PREVIEW
    ? "admin (demo)"
    : (session?.user?.name ?? "admin");

  return (
    <html lang="ja">
      <body>
        <div className="scene-bg" aria-hidden />
        {isLoggedIn ? (
          <div className="app-shell">
            <header className="app-header">
              <div className="app-header__brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="app-header__logo"
                  src={`${ASSETS}/logo.svg`}
                  alt="INSTYLE GROUP"
                />
                <span className="app-header__title">Claude Team Usage</span>
              </div>
              <AppNav />
              <div className="app-header__user">
                {PREVIEW ? (
                  <span className="badge badge-warning" title="認証バイパス中（モックデータ）">
                    PREVIEW
                  </span>
                ) : null}
                <span>{headerName}</span>
                <form
                  action={async () => {
                    "use server";
                    if (PREVIEW) return; // demo mode: no-op
                    // Auth.js v5 は redirectTo を素のサブドメイン直下に解釈する
                    // ので basePath を明示する。
                    await signOut({ redirectTo: "/claude-team-usage/login" });
                  }}
                >
                  <button className="btn" type="submit">
                    サインアウト
                  </button>
                </form>
              </div>
            </header>
            <main className="app-main">{children}</main>
          </div>
        ) : (
          <div className="login-shell">{children}</div>
        )}
      </body>
    </html>
  );
}
