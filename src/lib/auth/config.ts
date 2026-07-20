import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    };
  }
  interface User {
    role: UserRole;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  }
}

interface CustomJWT {
  id: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const supabase = createAdminClient();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email as string,
          password: credentials.password as string,
        });

        if (error || !data.user) return null;

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

        if (!profile) return null;

        return {
          id: data.user.id,
          email: data.user.email,
          name: `${profile.first_name} ${profile.last_name}`,
          role: profile.role as UserRole,
          firstName: profile.first_name,
          lastName: profile.last_name,
          avatarUrl: profile.avatar_url,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const customToken = token as unknown as CustomJWT;
      if (user) {
        customToken.id = user.id as string;
        customToken.role = (user as unknown as Record<string, unknown>).role as UserRole;
        customToken.firstName = (user as unknown as Record<string, unknown>).firstName as string;
        customToken.lastName = (user as unknown as Record<string, unknown>).lastName as string;
        customToken.avatarUrl = (user as unknown as Record<string, unknown>).avatarUrl as string | null;
      }
      return customToken as unknown as typeof token;
    },
    async session({ session, token }) {
      const customToken = token as unknown as CustomJWT;
      session.user.id = customToken.id;
      session.user.role = customToken.role;
      session.user.firstName = customToken.firstName;
      session.user.lastName = customToken.lastName;
      session.user.avatarUrl = customToken.avatarUrl;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
