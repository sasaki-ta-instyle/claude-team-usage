// ダッシュボード上で非表示にしたい email（小文字）。DB 側は保持したまま、
// イベント集計とロスターの両方から除外する。
// 個人 gmail 側で Claude Code を打っている本人が org アカウントに切り替えるまでの措置など。
export const HIDDEN_EMAILS_LOWER: readonly string[] = [
  "375tanabe.o8@gmail.com",
  "yasuda-re@instyle.group",
  "takagiwa@instyle.group",
];

const HIDDEN_SET = new Set(HIDDEN_EMAILS_LOWER);

export function isHiddenEmail(email: string): boolean {
  return HIDDEN_SET.has(email.toLowerCase());
}
