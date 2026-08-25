"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Profile } from "@/types";
import type { Session } from "@supabase/supabase-js";

// ─── Cache sessionStorage ────────────────────────────────────────────────────

const CACHE_KEY = "auth_profile_cache";

function readCache(): User | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function writeCache(user: User): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(user));
  } catch {
    // sessionStorage indisponible (incognito / quota dépassé) — on continue sans cache
  }
}

function clearCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readCache());
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => readCache() === null);
  const supabaseRef = useRef(createClient());

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabaseRef.current
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      return (data as Profile) ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      let currentSession: Session | null = null;

      try {
        const { data } = await supabaseRef.current.auth.getSession();
        currentSession = data?.session ?? null;
      } catch {
        // getSession a échoué — on finalise sans session
        if (mounted) setLoading(false);
        return;
      }

      if (!mounted) return;

      if (currentSession?.user) {
        const profile = await fetchProfile(currentSession.user.id);

        if (!mounted) return;

        if (profile) {
          const newUser: User = {
            id: currentSession.user.id,
            email: currentSession.user.email || "",
            profile,
          };

          // Mise à jour uniquement si les données diffèrent du cache (évite un re-render inutile)
          const currentCached = readCache();
          const hasChanged =
            !currentCached ||
            JSON.stringify(currentCached.profile) !== JSON.stringify(newUser.profile);

          if (hasChanged) {
            setSession(currentSession);
            setUser(newUser);
            writeCache(newUser);
          } else {
            // Données identiques : on s'assure que la session est bien positionnée
            setSession(currentSession);
          }
        } else {
          // fetchProfile a échoué — si on avait un cache, on le garde ; sinon user reste null
          if (readCache() === null) {
            setUser(null);
          }
        }
      } else {
        // Pas de session active → état déconnecté
        setSession(null);
        setUser(null);
        clearCache();
      }

      if (mounted) setLoading(false);
    }

    init();

    const { data: { subscription } } = supabaseRef.current.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;

        if (newSession?.user) {
          const profile = await fetchProfile(newSession.user.id);
          if (mounted && profile) {
            const newUser: User = {
              id: newSession.user.id,
              email: newSession.user.email || "",
              profile,
            };
            setSession(newSession);
            setUser(newUser);
            writeCache(newUser);
          }
        } else {
          setSession(null);
          setUser(null);
          clearCache();
        }
        if (mounted) setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshUser = useCallback(async () => {
    if (!session?.user) return;
    const profile = await fetchProfile(session.user.id);
    if (profile) {
      const newUser: User = {
        id: session.user.id,
        email: session.user.email || "",
        profile,
      };
      setSession(session);
      setUser(newUser);
      writeCache(newUser);
    }
  }, [session, fetchProfile]);

  const signOut = useCallback(async () => {
    await supabaseRef.current.auth.signOut();
    setUser(null);
    setSession(null);
    clearCache();
    window.location.href = "/login";
  }, []);

  const contextValue = useMemo(
    () => ({ user, session, loading, signOut, refreshUser }),
    [user, session, loading, signOut, refreshUser]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
