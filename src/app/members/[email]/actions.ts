"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";

export async function updateSeatType(email: string, seatType: string | null) {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) {
    throw new Error("forbidden");
  }
  const e = email.toLowerCase();
  const normalized =
    seatType === "premium" || seatType === "standard" ? seatType : null;

  const existing = await db.query.users.findFirst({
    where: (t, { eq: eq2 }) => eq2(t.email, e),
  });
  if (existing) {
    await db
      .update(schema.users)
      .set({ seatType: normalized })
      .where(eq(schema.users.email, e));
  } else {
    await db.insert(schema.users).values({ email: e, seatType: normalized });
  }
  revalidatePath(`/members/${encodeURIComponent(email)}`);
  revalidatePath("/members");
  revalidatePath("/");
}
