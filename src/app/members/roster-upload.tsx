"use client";

import { useActionState } from "react";

import { uploadRosterCsv, type RosterUploadState } from "./actions";

const SEAT_LABEL = { premium: "Premium", standard: "Standard" } as const;
const seatLabel = (s: "premium" | "standard" | null) => (s ? SEAT_LABEL[s] : "未割り当て");

export function RosterUpload({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const [state, action, pending] = useActionState<RosterUploadState, FormData>(
    uploadRosterCsv,
    { kind: "idle" }
  );

  return (
    <section className="glass-panel" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>メンバー / シートを取り込む</h2>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        claude.ai 管理画面 → メンバー で書き出した CSV（Name / Email / Role / Status / Seat Tier）を指定します。
        CSV にいる人がロスター、無い人はロスター外（tier 解除）になります。
        最終取り込み: <strong>{lastSyncedAt ?? "未実施"}</strong>
      </p>
      <form action={action} className="flex-row">
        <input type="file" name="csv" accept=".csv,text/csv" className="input" disabled={pending} required />
        <button className="btn btn--primary" type="submit" disabled={pending}>
          {pending ? "取り込み中..." : "取り込む"}
        </button>
      </form>

      {state.kind === "ok" ? (
        <div className="form-message form-message--ok" role="status" style={{ marginTop: 12 }}>
          {state.preview ? "（PREVIEW: DB には書き込んでいません）" : null}
          {state.result.total} 名を取り込みました — Premium {state.result.counts.premium} /
          Standard {state.result.counts.standard} / 未割り当て {state.result.counts.unassigned}
          {state.result.added.length ? <div>追加: {state.result.added.join(", ")}</div> : null}
          {state.result.removed.length ? <div>ロスター外へ: {state.result.removed.join(", ")}</div> : null}
          {state.result.seatChanges.length ? (
            <div>
              tier 変更:{" "}
              {state.result.seatChanges
                .map((c) => `${c.email}（${seatLabel(c.from)} → ${seatLabel(c.to)}）`)
                .join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}
      {state.kind === "error" ? (
        <div className="form-message form-message--error" role="alert" style={{ marginTop: 12 }}>
          取り込みませんでした（DB は変更なし）:
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
