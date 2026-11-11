"use client";

import { useActionState } from "react";

import { unlock, type UnlockState } from "./actions";

export function UnlockForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlock, {
    error: null,
  });
  return (
    <form action={action}>
      {state.error ? <p className="login-error">{state.error}</p> : null}
      <input type="hidden" name="from" value={from} />
      <div className="field">
        <label htmlFor="pin">暗証番号</label>
        <input
          className="input"
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={8}
          required
          autoComplete="off"
          autoFocus
        />
      </div>
      <button
        className="btn btn--primary"
        type="submit"
        disabled={pending}
        style={{ width: "100%" }}
      >
        {pending ? "確認中..." : "開く"}
      </button>
    </form>
  );
}
