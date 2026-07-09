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

| ルート | 内容 | データソース |
|---|---|---|
| `/login` | 共通パスワード入力（唯一の未認証 OK ページ） | — |
| `/` | KPI 7 枚（コスト内訳 / アクティブ数 / トークン / Premium 推奨 / Standard 維持 / API 従量候補 / 未使用） | **OTel push 統合**（Cowork + Code）＋ `users` roster |
| `/members?days=N` | メンバー別テーブル（Cowork / Code / 合計 / 稼働日 / 最大日コスト / api_error / 推奨 seat 4 値）。**合計コスト一本で判定**（≥ $100 = Premium / $10–$100 = Standard / < $10 = API 従量 / プロンプト 0 = 未使用）。副バッジで `制限到達`（api_error 観測）/ `高稼働`（≥ 15 日）を表示 | **OTel push 統合**＋稼働シグナル |
| `/members/[email]` | 日次推移チャート、seat 種別の手動編集 | Anthropic Admin API（旧、保留中） |
| `/cowork?days=N` | Cowork 単体の利用集計 | OTel push（service.name=cowork） |
| `/code-otel?days=N` | Claude Code CLI 単体の利用集計 | OTel push（service.name=claude-code） |
| `/api-messages?days=N` | コンソール API：実課金額（プロジェクト=Workspace 別 / 日次推移 / モデル別 / コスト種別）＋ トークン明細 | Anthropic Admin API（Cost Report + Messages） |
| `/simulate` | Premium / Standard 配分シミュレーション（**既定閾値 $100 = 損益分岐**、API 従量候補 → 集計外 トグル付き） | **OTel push 統合**＋ `users` roster |
| `/sync-log` | 直近 50 件の Admin API 取り込み履歴 | Anthropic Admin API |
| `/api/sync?source=code|messages|cost|workspaces|users|all` | Bearer SYNC_TOKEN 必須の取り込みエンドポイント | — |
| `/api/otel/v1/logs` / `/api/otel/logs/v1/logs` | OTel push 受信（Cowork / Claude Code 共通） | — |
| `/api/health` | health check | — |

### 集計ソースの方針

- **メイン画面（`/`, `/members`, `/simulate`）は OTel push 統合**を主軸とする。Cowork（admin > Monitoring）と Claude Code CLI（env vars）の両方から `/api/otel/v1/logs` に push されたイベントを `cowork_events` テーブルに保存し、`raw->'resource'->>'service.name'` で振り分け
- Anthropic Admin API（pull）は claude.ai SSO ユーザーが少ない（Team プランの仕様で admin role 2 名のみ取得可能）ため、メイン集計には使わない。`/api-messages` と `/sync-log` のみで参照
- Chat（claude.ai UI）の per-user 使用量は **取得不可**（Enterprise Analytics API 限定）

### OTel イベント受信（重要）

- エンドポイント: `https://app.instyle.group/claude-team-usage/api/otel`（exporter が `/v1/logs` を自動付与）
- 互換 path として `.../api/otel/logs/v1/logs` も受ける（Cowork クライアント側で旧 URL がキャッシュされてる場合の救済）
- 認証: `Authorization: Basic <token>` ヘッダ完全一致。値は env `COWORK_OTEL_AUTH`
- 属性キーは OTel セマンティック規約（ドット区切り）優先: `user.email` / `session.id` / `organization.id` / `prompt.id` / `model` / `cost_usd` / `cost_usd_micros` / `input_tokens` / `output_tokens` / `duration_ms`
- service.name=`cowork` は Cowork、`claude-code` or `claude_code` は Claude Code CLI

### チーム配布（Code OTel・組織配信）

**claude.ai 組織設定 → Claude Code → 管理設定（settings.json）** に以下の `env` を入れるだけで、組織内の全メンバーの CLI / IDE 拡張 / Desktop アプリに自動配信される（メンバー側の作業ゼロ）：

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "https://app.instyle.group/claude-team-usage/api/otel",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Basic <COWORK_OTEL_AUTH の base64 部分>"
  }
}
```

`COWORK_OTEL_AUTH` の現在値はサーバ env から `ssh conoha-deploy 'grep ^COWORK_OTEL_AUTH /var/www/_shared/apps/app-claude-team-usage.env'` で取得（値を context に出さない運用）。

claude.ai/code（Web 版 Code）はブラウザ実行なので env 配信の対象外。Anthropic が将来 Web 用の OTel push 機能を追加すれば自動で乗る想定。

### Anthropic Admin API（重要）

- `GET /v1/organizations/usage_report/claude_code` — per-user 日次（`actor.type=user_actor` のみ取り込み、`api_actor` は除外）
- `GET /v1/organizations/usage_report/messages` — account/workspace/api_key/model 単位の日次（トークン量）
- `GET /v1/organizations/cost_report` — **コンソール API の実課金額（USD）**。`bucket_width=1d` + `group_by[]=workspace_id,description`。`amount` は cents の小数文字列で返るので `numeric` の `cost_report_daily.amount_cents` にそのまま保持（精度ロス無し、表示時に /100）。`/api-messages` の金額セクションのソース
- `GET /v1/organizations/workspaces` — Workspace 一覧（Cost Report は id しか返さないので名前解決用に `workspaces` テーブルへキャッシュ）
- `GET /v1/organizations/users` — メンバー一覧、`seat_type` が返れば自動上書き
- **残りクレジット（プリペイド残高）は Admin API では取得不可**（公開エンドポイント無し）。可視化対象外
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

## 月次レポート運用（Neon ストレージ対策）

`cowork_events` は OTel の生イベントを 1 件 1 行 + `raw jsonb` で溜め続けるため、放置すると Neon Postgres のストレージが 1〜2 ヶ月で満杯になる。対策として月初に前月分をダッシュボード HTML スナップショットとして固定化し、raw は「前月分だけ残して先々月以前を DELETE + VACUUM」する運用にする。

### 生成物

- **月次スナップショット**: `https://app.instyle.group/html/claude-team-usage-YYYY-MM.html`（1 ファイル ≒ 20KB、この月の raw が消えても数値・メンバー一覧はここに固定化される）
- **索引ページ**: `https://app.instyle.group/html/claude-team-usage-reports.html`（過去月一覧、月初 cron で自動再生成）
- 索引ページは workspace-index (`workspace-index/data.json`) の `html_single` にも登録済み

### 実装

- **API**: `src/app/api/report/[month]/route.ts` — Bearer 認証 (`SYNC_TOKEN`) 必須。JST 月初〜翌月初の範囲で `combinedOverall` / `combinedMemberSummary` を集計し、`globals.css` を inline した単一 HTML を返す
- **middleware**: `/api/report` を PUBLIC 化。認証はハンドラ側の Bearer で行う
- **CLI**: `scripts/monthly-report.mjs` — 前月分を fetch → `tmp/reports/` に保存 → 本番 `/html/` に scp → 索引再生成 → `cowork_events` の先々月以前を DELETE + VACUUM → 任意で Telegram 通知

### 環境変数

| キー | 用途 | 既定値 |
|---|---|---|
| `SYNC_TOKEN` | 既存。レポート API の Bearer 認証にも共用 | — |
| `DATABASE_URL` | 既存。DELETE / VACUUM 用 | — |
| `APP_BASE_URL` | 内部から叩くアプリの base URL | `http://127.0.0.1:3011/claude-team-usage` |
| `REPORT_HTML_DEST` | 転送先。`<host>:<dir>` なら scp、`/absolute/path` ならローカル `cp`（サーバ内 cron 実行時はこちらにする） | `conoha-root:/var/www/app/html` |
| `REPORT_PUBLIC_URL_BASE` | 公開 URL prefix（HEAD 確認と表示用） | `https://app.instyle.group/html` |
| `TELEGRAM_NOTIFY_URL` | 任意。ig-secretary の HTTP endpoint。POST で JSON `{text, source}` | — |

### コマンド

```bash
# ローカル動作確認（PREVIEW モードで mock データ）
PREVIEW=1 SYNC_TOKEN=localtest pnpm dev &
APP_BASE_URL=http://127.0.0.1:3000/claude-team-usage \
SYNC_TOKEN=localtest \
DATABASE_URL="postgres://placeholder:placeholder@127.0.0.1:5432/placeholder" \
  pnpm monthly-report -- --month=2026-06 --dry-run --skip-delete --skip-scp

# 本番手動実行（サーバで実行、前月分を対象）
# REPORT_HTML_DEST は絶対パスにすることでサーバ内 cp モードにする
ssh conoha-deploy 'cd /var/www/app/claude-team-usage/current \
  && set -a && . /var/www/_shared/apps/app-claude-team-usage.env && set +a \
  && REPORT_HTML_DEST=/var/www/app/html node scripts/monthly-report.mjs'

# 特定月を対象、削除だけ止めたい場合
node scripts/monthly-report.mjs --month=2026-06 --skip-delete
```

### 削除ルール

- **境界**: 実行時 JST の「今月月初 − 1 ヶ月」= 前月月初。`occurred_at < 境界` を DELETE
- **例**: 2026-07-01 03:00 JST 実行 → 5 月分以前（`< 2026-06-01 JST`）を削除、6 月分は raw を残す
- **daily 集計テーブル**（`code_usage_daily` / `messages_usage_daily` / `cost_report_daily`）は行数が有界なので保持
- **安全弁**: レポート HTML が本番で 2xx を返さなければ DELETE を skip して exit 2

### cron 設定（サーバ crontab）

`ssh conoha-deploy 'crontab -l'` で確認、`crontab -e` で追記。既存の 6h sync 行の隣に:

```
0 3 1 * * cd /var/www/app/claude-team-usage/current && set -a && . /var/www/_shared/apps/app-claude-team-usage.env && set +a && REPORT_HTML_DEST=/var/www/app/html node scripts/monthly-report.mjs >> /var/log/app-claude-team-usage-monthly.log 2>&1
```

### 初回反映手順（手動）

1. main を push（この節を含む変更）→ `gh workflow run deploy-prod.yml --ref main && gh run watch`
2. `/var/www/app/html/` に deploy user が書き込めることを確認:
   ```bash
   ssh conoha-deploy 'test -w /var/www/app/html && echo writable || echo readonly'
   # readonly なら:  ssh conoha-root 'chown deploy:deploy /var/www/app/html'
   ```
3. サーバから 1 回だけ手動で前月分を生成:
   ```bash
   ssh conoha-deploy 'cd /var/www/app/claude-team-usage/current \
     && set -a && . /var/www/_shared/apps/app-claude-team-usage.env && set +a \
     && REPORT_HTML_DEST=/var/www/app/html node scripts/monthly-report.mjs'
   ```
4. `curl -sSLo /dev/null -w "%{http_code}\n" https://app.instyle.group/html/claude-team-usage-<前月>.html` で 200 確認
5. `bash ~/Workspace/workspace-index/deploy.sh` で索引ページを反映
6. crontab に月次エントリを追加

### トラブルシュート

- **`report fetch failed: 401`** → `SYNC_TOKEN` が env に無いか一致していない。サーバでは `/var/www/_shared/apps/app-claude-team-usage.env` を `set -a && . ... && set +a` で読み込んでから叩く
- **`scp exited with code`** → `~/.ssh/config` の `conoha-root`（または `REPORT_HTML_DEST` で指定した host）が繋がるか確認
- **`VACUUM ANALYZE` で長く時間がかかる** → 通常は数秒。10 分超なら Neon サポートに branch のリサイズを相談（`~/Workspace/CLAUDE.md` の [[reference-vercel-neon-provisioning]] 参照）
- **削除量ゼロなのに Neon サイズが減らない** → autovacuum の起動待ち。`SELECT pg_size_pretty(pg_relation_size('cowork_events'));` で確認、必要なら `VACUUM FULL cowork_events`（排他ロックに注意）
