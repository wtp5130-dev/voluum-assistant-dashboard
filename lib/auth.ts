import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist email/name on first sign in
      if (account && profile) {
        token.email = token.email || (profile as any).email;
        token.name = token.name || (profile as any).name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token as any).email || session.user.email || undefined;
        session.user.name = (token as any).name || session.user.name || undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
