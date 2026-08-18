"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
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
  // Restauration synchrone depuis le cache pour un loading=false immédiat au second montage
  const cachedUser = readCache();

  const [user, setUser] = useState<User | null>(cachedUser);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(cachedUser === null); // false si cache présent
  const supabase = createClient();

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url, role, is_active, team_id, birth_date")
        .eq("id", userId)
        .single();
      return (data as unknown as Profile) ?? null;
    } catch {
      return null;
    }
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      let currentSession: Session | null = null;

      try {
        const { data } = await supabase.auth.getSession();
        currentSession = data?.session ?? null;
      } catch {
        // getSession a échoué — on finalise sans session
        if (mounted && cachedUser === null) setLoading(false);
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
          if (cachedUser === null) {
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, fetchProfile]);

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
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    clearCache();
    window.location.href = "/login";
  }, [supabase]);

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
