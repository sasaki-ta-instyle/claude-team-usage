"use client";

import { useState, useTransition } from "react";

import { updateSeatType } from "./actions";

const OPTIONS = [
  { value: "", label: "未設定" },
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" },
];

type Message = { kind: "ok" | "error"; text: string } | null;

export function SeatForm({
  email,
  current,
}: {
  email: string;
  current: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  return (
    <form
      className="flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const value = String(formData.get("seatType") ?? "") || null;
        setMessage(null);
        startTransition(async () => {
          try {
            await updateSeatType(email, value);
            const label = value ?? "未設定";
            setMessage({
              kind: "ok",
              text: `seat を「${label}」に更新しました（${new Date().toLocaleString("ja-JP")}）`,
            });
          } catch (err) {
            const text = err instanceof Error ? err.message : String(err);
            setMessage({
              kind: "error",
              text: `seat を更新できませんでした: ${text}`,
            });
          }
        });
      }}
    >
      <select
        name="seatType"
        defaultValue={current ?? ""}
        className="input"
        disabled={pending}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "更新中..." : "seat を更新"}
      </button>
      {message ? (
        <span
          className={`form-message form-message--${message.kind}`}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </span>
      ) : null}
    </form>
  );
}
