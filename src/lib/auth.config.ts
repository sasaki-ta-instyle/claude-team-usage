// Edge-safe Auth.js config used by middleware.
// Keep this file free of Node-only imports (no DB / no bcrypt).
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 }, // 30d
  pages: { signIn: "/login" },
  providers: [], // populated in auth.ts (Node-only)
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as { isAdmin?: boolean }).isAdmin = true;
        token.name = user.name ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { isAdmin?: boolean }).isAdmin = Boolean(
          (token as { isAdmin?: boolean }).isAdmin
        );
        session.user.name = (token.name as string | undefined) ?? "admin";
      }
      return session;
    },
  },
};
