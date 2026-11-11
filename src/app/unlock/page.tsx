import { UnlockForm } from "./unlock-form";

export const dynamic = "force-dynamic";

export default async function UnlockPage(props: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await props.searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card glass-panel">
        <h1 className="login-title">Claude Team Usage</h1>
        <p className="login-sub">閲覧には暗証番号が必要です。</p>
        <UnlockForm from={from ?? "/"} />
      </div>
    </div>
  );
}
