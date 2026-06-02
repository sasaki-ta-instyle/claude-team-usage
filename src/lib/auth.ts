import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";

class WrongPassword extends CredentialsSignin {
  code = "WrongPassword";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Admin Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const password = String(credentials?.password ?? "");
        const hash = process.env.ADMIN_PASSWORD_HASH ?? "";
        if (!password || !hash) throw new WrongPassword();
        const ok = await bcrypt.compare(password, hash);
        if (!ok) throw new WrongPassword();
        // Single admin identity. id/name are surfaced to the JWT.
        return { id: "admin", name: "admin" };
      },
    }),
  ],
});
