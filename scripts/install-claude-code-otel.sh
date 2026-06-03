#!/usr/bin/env bash
# Claude Code (CLI) の利用状況を instyle claude-team-usage ダッシュボードに
# OTel push で送信するための環境変数を、各メンバーの ~/.zshrc または
# ~/.bashrc に冪等に追加するインストーラ。
#
# 使い方:
#   curl -sS https://raw.githubusercontent.com/sasaki-ta-instyle/claude-team-usage/main/scripts/install-claude-code-otel.sh | bash
# または手元に clone してから:
#   bash scripts/install-claude-code-otel.sh
#
# 設定後は新しいターミナルを開くか `source ~/.zshrc` で反映。
set -euo pipefail

OTEL_ENDPOINT="https://app.instyle.group/claude-team-usage/api/otel"
OTEL_HEADERS='Authorization=Basic Y293b3JrOjA5YmIwMDYwMTc4YzBhNDczNzFmOWZhY2Y3MTJmOGNlOWJiMjBkM2RlZTdkZGQzZWI2YTRmYTZmNDFhOTliMTA='

MARKER="# claude-team-usage:install-claude-code-otel"
BLOCK=$(cat <<EOF

${MARKER} (この行は識別用、消さないでください)
# Claude Code (CLI) の利用イベントを instyle のダッシュボードに送る設定。
# 確認: https://app.instyle.group/claude-team-usage/code-otel
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_ENDPOINT=${OTEL_ENDPOINT}
export OTEL_EXPORTER_OTLP_HEADERS="${OTEL_HEADERS}"
EOF
)

case "${SHELL:-}" in
  */zsh)  RC_FILE="${HOME}/.zshrc" ;;
  */bash) RC_FILE="${HOME}/.bashrc" ;;
  *)      RC_FILE="${HOME}/.profile" ;;
esac

echo "対象ファイル: ${RC_FILE}"

if [ -f "${RC_FILE}" ] && grep -qF "${MARKER}" "${RC_FILE}"; then
  echo "既にインストール済み。何もしません。"
  echo "rotate するときは ${RC_FILE} から ${MARKER} を含むブロックを手で消してから再実行。"
  exit 0
fi

printf '%s\n' "${BLOCK}" >> "${RC_FILE}"
echo "追加しました。次のいずれかで反映:"
echo "  1. 新しいターミナルを開く"
echo "  2. または: source ${RC_FILE}"
echo
echo "あとは普段通り \`claude\` を使うだけ。1〜2 分以内に"
echo "https://app.instyle.group/claude-team-usage/code-otel に自分の email が出現します。"
