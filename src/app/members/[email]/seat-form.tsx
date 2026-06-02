"use client";

import { useTransition } from "react";

import { updateSeatType } from "./actions";

const OPTIONS = [
  { value: "", label: "未設定" },
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" },
];

export function SeatForm({
  email,
  current,
}: {
  email: string;
  current: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const value = String(formData.get("seatType") ?? "") || null;
        startTransition(async () => {
          await updateSeatType(email, value);
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
    </form>
  );
}
