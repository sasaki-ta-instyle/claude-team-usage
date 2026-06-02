# claude-team-usage

## デプロイ設定（Claude Code 用）

このプロジェクトは ConoHa VPS にデプロイされる。本番反映は「本番にあげて」の指示で起動する（ワークスペース CLAUDE.md の「ConoHa 本番デプロイ」節を参照）。

| キー | 値 |
|---|---|
| CATEGORY | `app` |
| APP_NAME | `claude-team-usage` |
| PORT | `3011` |
| 公開URL | `https://app.instyle.group/claude-team-usage/` |
| HEALTHCHECK_PATH | `/claude-team-usage/api/health` |
| USE_DB | `true` |
| PM2名 | `app-claude-team-usage` |
| サーバ側パス | `/var/www/app/claude-team-usage/` |
| アプリ固有 env | `/var/www/_shared/apps/app-claude-team-usage.env` |

## 共通アセット (favicon / logo / OGP)

`https://app.instyle.group/_shared/static/{favicon.png, logo.svg, ogp.jpg}` で配信。`app/layout.tsx` の metadata に絶対 URL で指定する（詳細: `~/Workspace/docs/conoha-shared-assets.md`）。

```ts
const SITE_URL = "https://app.instyle.group/claude-team-usage";
const ASSETS   = "https://app.instyle.group/_shared/static";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: `${ASSETS}/favicon.png`, apple: `${ASSETS}/favicon.png` },
  openGraph: {
    type: "website", siteName: "INSTYLE GROUP", locale: "ja_JP",
    url: SITE_URL, title: TITLE, description: DESCRIPTION,
    images: [{ url: `${ASSETS}/ogp.jpg`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image", title: TITLE, description: DESCRIPTION,
    images: [`${ASSETS}/ogp.jpg`],
  },
};
```

## ローカル開発

```bash
pnpm install
pnpm dev
# http://localhost:3000/claude-team-usage/ でアクセス（basePath 込み）
```

> **初回コミット前に必ず `pnpm install` を実行**してください。生成された `pnpm-lock.yaml` をコミットに含めないと、GitHub Actions の `actions/setup-node@v4` (`cache: pnpm`) が `Dependencies lock file is not found` で失敗します。

## 本番デプロイ

「本番にあげて」と Claude Code に指示すると、`gh workflow run deploy-prod.yml --ref main` で GitHub Actions が走り、ConoHa VPS にデプロイされる。

手動で起動する場合:
```bash
gh workflow run deploy-prod.yml --ref main
gh run watch
```

## 初回 ConoHa セットアップ手順（このアプリ用）

```bash
# 1. アプリディレクトリ
ssh conoha-deploy 'mkdir -p /var/www/app/claude-team-usage/{releases,shared} \
  && touch /var/www/_shared/apps/app-claude-team-usage.env \
  && chmod 600 /var/www/_shared/apps/app-claude-team-usage.env'

# 2. Nginx location（exact + ^~ prefix の 2 段で trailing-slash 308 ループ回避）
ssh conoha-root 'cat > /etc/nginx/conf.d/proxy-apps/app/claude-team-usage.conf <<"EOF"
location = /claude-team-usage {
  include snippets/proxy-next.conf;
  proxy_pass http://127.0.0.1:3011;
}
location ^~ /claude-team-usage/ {
  include snippets/proxy-next.conf;
  proxy_pass http://127.0.0.1:3011;
}
EOF
nginx -t && systemctl reload nginx'
```

## ロールバック

GitHub Actions 側のヘルスチェック失敗時は自動で前 release に戻る。手動で戻す場合:

```bash
ssh deploy@160.251.201.115
cd /var/www/app/claude-team-usage/releases
ls -lt   # 直前の release ディレクトリを確認
ln -sfn <previous-sha> ../current.new && mv -T ../current.new ../current
pm2 reload app-claude-team-usage --update-env
```

## デザインシステム

**Liquid Glass**（`~/Workspace/design-system_liquid/`）に準拠。warm glass を主役にした半透明 + backdrop-filter のダッシュボード。`src/app/globals.css` に tokens / scene-bg / glass-panel / card / btn を実装、`src/app/layout.tsx` で scene-bg と app shell（sticky header + nav + main）を組む。チャートは recharts、液体パレット `#35362D / #D4772C` を使用。

## プロジェクト概要

instyle group が契約する **Claude Team プラン**の使用量を可視化し、Premium ($125/seat) / Standard ($25/seat) の配分判断を支える管理ダッシュボード。**Admin 専用**（`ADMIN_EMAILS` + `@instyle.group` 二重 allowlist）。

### スタック

- Next.js 15.5 (App Router, standalone build)
- Auth.js v5 (`next-auth@5.0.0-beta`) + **Credentials Provider（共通パスワード方式）** + bcryptjs
- Neon Postgres + drizzle-orm + `pg` ドライバ（メンバー / 使用量データのみ。auth テーブルは未使用）
- recharts 2.x
- Liquid design-system

### 主要ルート

| ルート | 内容 |
|---|---|
| `/login` | 共通パスワード入力（唯一の未認証 OK ページ） |
| `/` | KPI 4 枚（アクティブ数 / トークン / 推定コスト USD+JPY / Premium 推奨者数） |
| `/members?days=N` | メンバー別テーブル（期間絞り） |
| `/members/[email]` | 日次推移チャート、seat 種別の手動編集 |
| `/api-messages?days=N` | API Messages 集計（account×workspace×api_key×model 単位） |
| `/simulate` | 配分シミュレーション（閾値スライダー、デフォルト $50） |
| `/sync-log` | 直近 50 件の取り込み履歴 |
| `/api/sync?source=code|messages|users|all` | Bearer SYNC_TOKEN 必須の取り込みエンドポイント |
| `/api/health` | health check |

### Anthropic Admin API（重要）

- `GET /v1/organizations/usage_report/claude_code` — per-user 日次（`actor.type=user_actor` のみ取り込み、`api_actor` は除外）
- `GET /v1/organizations/usage_report/messages` — account/workspace/api_key/model 単位の日次
- `GET /v1/organizations/users` — メンバー一覧、`seat_type` が返れば自動上書き
- 認証: `x-api-key: $ANTHROPIC_ADMIN_API_KEY` + `anthropic-version: 2023-06-01`
- データ遅延 1h。`/api/sync` は直近 7 日 rolling re-fetch で upsert
- **Team プランの構造的制約**: Chat / Cowork の per-user 数値は取れない（Enterprise 限定）。詳細は memory `reference-anthropic-admin-api-scope`

### cron（ConoHa crontab）

```
0 */6 * * * curl -fsS -H "Authorization: Bearer $SYNC_TOKEN" https://app.instyle.group/claude-team-usage/api/sync?source=all >> /var/log/app-claude-team-usage-sync.log 2>&1
```

`setup-prod-env.sh` 実行後に表示される一行を crontab -e に追加する（`$SYNC_TOKEN` はサーバ側 env から `ssh conoha-deploy 'grep -E ^SYNC_TOKEN= /var/www/_shared/apps/app-claude-team-usage.env'` で参照可、値を context に出さない）。

### 本番初回反映の段取り

1. `gh repo create sasaki-ta-instyle/claude-team-usage --public --source=. --remote=origin --push`
2. `bash ~/Workspace/scripts/bootstrap-conoha-app.sh`（ポート台帳追記済みなので skip 可、サーバ側ディレクトリ + nginx だけ整える）
3. **iTerm 等の通常ターミナル**で `bash scripts/setup-prod-env.sh` を実行（Claude Code の `!` バッシュは TTY なし [[feedback-claude-code-bang-bash-no-tty]]）
4. `gh workflow run deploy-prod.yml --ref main && gh run watch`
5. `curl -sSLo /dev/null -w "%{http_code}\n" https://app.instyle.group/claude-team-usage/` で 2xx 二重確認
6. `crontab -e` で cron 行を追加
7. `curl -H "Authorization: Bearer $TOKEN" https://app.instyle.group/claude-team-usage/api/sync?source=users` で初回取り込み確認

### Workflow 側の追加変数

`deploy-prod.yml` の `vars.MIGRATE_CMD` は省略時 `pnpm migrate` を使う。ローカルで `pnpm db:generate` 済みの `drizzle/0000_*.sql` がリポジトリに含まれている前提。スキーマを変えたら `pnpm db:generate` を回して migration ファイルを commit する。
