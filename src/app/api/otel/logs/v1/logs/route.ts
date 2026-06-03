// Cowork admin に保存された OTLP エンドポイント URL が
// `/api/otel/logs` のままになっているクライアント向けの互換 path。
// （正規 URL は `/api/otel` で /v1/logs は exporter が自動付与）
import { handleOtelLogs } from "@/lib/otel-logs-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleOtelLogs(req);
}
