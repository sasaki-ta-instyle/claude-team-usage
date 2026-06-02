// Edge-safe Auth.js config used by middleware.
// Keep this file free of Node-only imports (no DB / no `pg`).
import type { NextAuthConfig } from "next-auth";

import { isAdminEmail } from "./admin-emails";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30d
  pages: { signIn: "/login" },
  providers: [], // populated in auth.ts (Node-only)
  callbacks: {
    async signIn({ user }) {
      return isAdminEmail(user.email);
    },
    async jwt({ token, user }) {
      // user is set only on initial sign-in. Persist admin flag on the JWT.
      if (user?.email) {
        token.email = user.email;
        (token as { isAdmin?: boolean }).isAdmin = isAdminEmail(user.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string | undefined) ?? session.user.email;
        (session.user as { isAdmin?: boolean }).isAdmin =
          Boolean((token as { isAdmin?: boolean }).isAdmin);
      }
      return session;
    },
  },
};
