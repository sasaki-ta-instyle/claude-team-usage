"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { PREVIEW } from "@/lib/preview";
import {
  RosterCsvError,
  importRosterCsv,
  parseRosterCsv,
  type RosterImportResult,
} from "@/lib/roster-import";

export type RosterUploadState =
  | { kind: "idle" }
  | { kind: "ok"; result: RosterImportResult; preview: boolean }
  | { kind: "error"; problems: string[] };

const MAX_BYTES = 512 * 1024;

export async function uploadRosterCsv(
  _prev: RosterUploadState,
  formData: FormData
): Promise<RosterUploadState> {
  if (!PREVIEW) {
    const session = await auth();
    if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) {
      return { kind: "error", problems: ["権限がありません（admin のみ）"] };
    }
  }
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return { kind: "error", problems: ["CSV ファイルを選択してください"] };
  }
  if (file.size > MAX_BYTES) {
    return { kind: "error", problems: ["ファイルが大きすぎます（512KB まで）"] };
  }
  const text = await file.text();
  try {
    if (PREVIEW) {
      // demo mode: DB には書かず、パース結果だけ返す
      const entries = parseRosterCsv(text);
      return {
        kind: "ok",
        preview: true,
        result: {
          total: entries.length,
          counts: {
            premium: entries.filter((e) => e.seatType === "premium").length,
            standard: entries.filter((e) => e.seatType === "standard").length,
            unassigned: entries.filter((e) => e.seatType === null).length,
          },
          added: [],
          removed: [],
          seatChanges: [],
        },
      };
    }
    const result = await importRosterCsv(text);
    revalidatePath("/members");
    revalidatePath("/simulate");
    revalidatePath("/");
    return { kind: "ok", result, preview: false };
  } catch (err) {
    if (err instanceof RosterCsvError) return { kind: "error", problems: err.problems };
    return {
      kind: "error",
      problems: [err instanceof Error ? err.message : String(err)],
    };
  }
}
