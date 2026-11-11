import Link from "next/link";

import { eventsDataStart, rosterMemberSummary } from "@/lib/cowork-queries";
import { rosterLastSyncedAt } from "@/lib/queries";
import { isAdminViewer } from "@/lib/viewer";
import {
  DEFAULT_SEAT_POLICY,
  SEAT_REVIEW_DAYS,
  RATE_LIMIT_SLOT_META,
  WORK_HOURS_JST,
  type RateLimitHit,
  type RateLimitSlot,
  effectiveRangeDays,
  recommendReason,
  recommendSeat,
  SEAT_RECO_META,
  seatSignals,
} from "@/lib/seat-recommendation";
import { RosterUpload } from "./roster-upload";
import {
  formatJpyFromCents,
  formatUsd,
  isoDateMinusDays,
} from "@/lib/format";

// コスト列は狭いので $X / ¥Y を 2 段に組む。強調は totalCost のみ。
function CostStack({ cents, emphasize = false }: { cents: number; emphasize?: boolean }) {
  return (
    <>
      {emphasize ? (
        <strong>{formatUsd(cents)}</strong>
      ) : (
        formatUsd(cents)
      )}
      <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginTop: 2 }}>
        {formatJpyFromCents(cents)}
      </div>
    </>
  );
}

// 制限到達日を「勤務内 / 時間外 / 土日」に分けて見せる。件数チップ＋日付・時刻の一覧。
const SLOT_ORDER: RateLimitSlot[] = ["work", "after", "weekend"];
const MAX_LISTED_HITS = 6;

function RateLimitBreakdown({ hits }: { hits: RateLimitHit[] }) {
  if (hits.length === 0) return null;
  const counts = SLOT_ORDER.map((slot) => ({
    slot,
    n: hits.filter((h) => h.slot === slot).length,
  })).filter((c) => c.n > 0);
  const listed = hits.slice(-MAX_LISTED_HITS);
  return (
    <div style={{ marginTop: 4, fontWeight: 400, textAlign: "left" }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {counts.map((c) => (
          <span key={c.slot} className={`badge ${RATE_LIMIT_SLOT_META[c.slot].badge}`}>
            {RATE_LIMIT_SLOT_META[c.slot].label} {c.n}
          </span>
        ))}
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: "4px 0 0",
          padding: 0,
          fontSize: 11,
          color: "var(--color-text-muted)",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {hits.length > listed.length ? <li>… 他 {hits.length - listed.length} 日</li> : null}
        {listed.map((h) => (
          <li key={h.date}>
            {h.date.slice(5).replace("-", "/")}（{h.dow}）{h.time}{" "}
            <span style={h.slot === "work" ? { color: "var(--color-warning)", fontWeight: 600 } : undefined}>
              {RATE_LIMIT_SLOT_META[h.slot].label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const dynamic = "force-dynamic";

const PRESETS = [
  { label: "過去 7 日", days: 7 },
  { label: "過去 30 日", days: 30 },
  { label: "過去 90 日", days: 90 },
];

const HIGH_ACTIVITY_DAYS = 15;
const POLICY = DEFAULT_SEAT_POLICY;

export default async function MembersPage(props: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await props.searchParams;
  const range = Math.max(1, Math.min(180, Number(days) || SEAT_REVIEW_DAYS));
  const fromDate = isoDateMinusDays(range);
  const toDate = isoDateMinusDays(0);
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date();
  const [members, dataStart, lastSynced, isAdmin] = await Promise.all([
    rosterMemberSummary({ from, to }),
    eventsDataStart(),
    rosterLastSyncedAt(),
    isAdminViewer(),
  ]);
  const rangeDays = effectiveRangeDays(from, to, dataStart);
  const dataStartIso = dataStart && dataStart > from ? isoDateJst(dataStart) : null;
  const rosterCount = members.filter((m) => m.inRoster).length;

  return (
    <>
      <h1 className="page-title">メンバー</h1>
      <p className="page-subtitle">
        期間: <strong>{fromDate}</strong> – <strong>{toDate}</strong>
        {dataStartIso ? (
          <>
            （生イベントは月次運用で古い分を削除済みのため、実データは <strong>{dataStartIso}</strong> 以降）
          </>
        ) : null}
        。ロスター {rosterCount} 名。
        推奨 seat は「勤務時間（平日 {WORK_HOURS_JST.startHour}–{WORK_HOURS_JST.endHour} 時）に Standard の上限が仕事を止めているか」で判定。
        <strong>
          月に 勤務時間内の制限到達 {POLICY.limitHitDays} 日以上、または 勤務時間内に直前 5 時間の利用が{" "}
          {formatUsd(POLICY.peakCapCents)} 以上の日が {POLICY.peakDays} 日以上 = Premium 推奨
        </strong>{" "}
        / それ以外 = Standard 維持（月コストが大きくても上限に当たらなければ Standard で足りる）。
        <strong>土日・時間外の利用と制限到達は Premium 判定に換算しない</strong>（合計コストの下の（勤務内 $X）が判定に使う分）/
        <strong>月換算 &lt; $10 = API 従量候補</strong> / プロンプト 0 = 未使用。
        制限到達は HTTP 429（レート制限）だけを数える（OAuth 切れ等のエラーは除外）。
        日ごとに <strong>勤務内</strong>（平日 {WORK_HOURS_JST.startHour}–{WORK_HOURS_JST.endHour} 時に到達）/
        <strong>時間外</strong>（平日のそれ以外の時間）/ <strong>土日</strong> を表示し、時刻はその日の最初の到達（勤務内があればその時刻）。
        副バッジで <strong>高稼働</strong>（≥ {HIGH_ACTIVITY_DAYS} 日アクティブ）を表示。
        <strong>現状 tier</strong> と推奨がズレている場合は「⬇ 過剰投資」（Premium 割当だが推奨は下位）／
        「⬆ 過小投資」（Standard 割当だが推奨 Premium）バッジで警告する。
      </p>

      <div className="flex-row" style={{ marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <Link
            key={p.days}
            className={`btn${p.days === range ? " btn--quiet-active" : ""}`}
            href={`/members?days=${p.days}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {isAdmin ? (
        <RosterUpload lastSyncedAt={lastSynced ? formatJst(lastSynced) : null} />
      ) : null}

      <div className="glass-panel">
        {members.length === 0 ? (
          <p className="muted">
            データがありません。Cowork admin の Monitoring か、メンバーの
            Claude Code OTel 設定（<code>scripts/install-claude-code-otel.sh</code>）が必要です。
          </p>
        ) : (
          <div className="table-scroll">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>メンバー</th>
                  <th className="num num--narrow">Cowork プロンプト</th>
                  <th className="num num--narrow">Code プロンプト</th>
                  <th className="num">Cowork コスト</th>
                  <th className="num">Code コスト</th>
                  <th className="num">合計コスト</th>
                  <th className="num">稼働日</th>
                  <th className="num">最大日コスト</th>
                  <th className="num num--narrow">制限到達日数</th>
                  <th className="num">勤務時間 5h ピーク</th>
                  <th>現状 tier</th>
                  <th>推奨 seat</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const reco = recommendSeat(m, rangeDays);
                  const sig = seatSignals(m, rangeDays);
                  const meta = SEAT_RECO_META[reco];
                  const isApiDirect = reco === "api_direct_candidate";
                  const activeDays = m.activeDays;
                  // 強調は勤務時間内の到達があるときだけ（時間外・土日だけなら判定に効かないので通常色）
                  const isCapped = m.rateLimitHits.some((h) => h.slot === "work");
                  const peakDays = m.workPeaksCents.filter((c) => c >= POLICY.peakCapCents).length;
                  const isHighActivity = activeDays >= HIGH_ACTIVITY_DAYS;
                  const currentSeat = m.seatType;
                  const overInvest =
                    currentSeat === "premium" && reco !== "premium";
                  const underInvest =
                    currentSeat === "standard" && reco === "premium";
                  return (
                    <tr key={m.email} className={isApiDirect ? "row-warn" : undefined}>
                      <td>
                        <Link href={`/members/${encodeURIComponent(m.email)}`}>
                          {m.displayName ?? m.email}
                        </Link>
                        {m.displayName ? (
                          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                            {m.email}
                          </div>
                        ) : null}
                      </td>
                      <td className="num num--narrow">{m.coworkPrompts.toLocaleString()}</td>
                      <td className="num num--narrow">{m.codePrompts.toLocaleString()}</td>
                      <td className="num"><CostStack cents={m.coworkCostCents} /></td>
                      <td className="num"><CostStack cents={m.codeCostCents} /></td>
                      <td className="num">
                        <CostStack cents={m.totalCostCents} emphasize />
                        <div
                          className="muted"
                          style={{ fontSize: 11, marginTop: 2 }}
                          title="土日・時間外（平日 10–18 時以外）の利用を除いたコスト。Premium 判定はこちらを使う"
                        >
                          （勤務内 {formatUsd(m.workCostCents)}）
                        </div>
                      </td>
                      <td className="num">{activeDays}</td>
                      <td className="num"><CostStack cents={m.maxDayCostCents} /></td>
                      <td
                        className="num num--narrow"
                        style={isCapped ? { color: "var(--color-warning)", fontWeight: 600 } : undefined}
                      >
                        {m.rateLimitHits.length}
                        <RateLimitBreakdown hits={m.rateLimitHits} />
                      </td>
                      <td className="num">
                        {formatUsd(sig.maxPeakCents)}
                        <div
                          className="muted"
                          style={{ fontSize: 11, marginTop: 2 }}
                          title={`勤務時間内に直前 5 時間の利用が ${formatUsd(POLICY.peakCapCents)} 以上になった日数`}
                        >
                          {formatUsd(POLICY.peakCapCents)}+ {peakDays} 日
                        </div>
                      </td>
                      <td>
                        {!m.inRoster ? (
                          <span
                            className="badge badge-warning"
                            title="claude.ai 管理画面のメンバー CSV に居ない email（個人アカウント・退職者など）"
                          >
                            ロスター外
                          </span>
                        ) : currentSeat === "premium" ? (
                          <span className="badge badge-success">Premium</span>
                        ) : currentSeat === "standard" ? (
                          <span className="badge badge-info">Standard</span>
                        ) : (
                          <span className="badge badge-default">未割り当て</span>
                        )}
                        {overInvest ? (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--color-warning)",
                            }}
                            title="Premium 割当だが推奨は下位。Standard / API 従量への切り替え検討"
                          >
                            ⬇ 過剰投資
                          </div>
                        ) : null}
                        {underInvest ? (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--color-info)",
                            }}
                            title="Standard 割当だが推奨は Premium。昇格検討"
                          >
                            ⬆ 過小投資
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {recommendReason(reco, sig)}
                        </div>
                        {isHighActivity ? (
                          <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                            <span className="badge badge-accent" title={`過去 ${range} 日のうち ${activeDays} 日アクティブ`}>
                              高稼働
                            </span>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function isoDateJst(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatJst(d: Date): string {
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}
