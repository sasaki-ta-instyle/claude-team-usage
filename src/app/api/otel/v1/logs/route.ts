import { handleOtelLogs } from "@/lib/otel-logs-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleOtelLogs(req);
}
