import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { User as Profile } from '@/types';
import { supabase, authState } from '@/lib/supabase';

interface AuthContextType {
  /** Profile row (public.users). Null when not approved yet. */
  user: Profile | null;
  /** Supabase Auth identity. Null when signed out. */
  authUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<boolean>;
  isSharks: boolean;
  isAdmin: boolean;
  isClient: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[auth] profile load error:', error.message);
    return null;
  }
  return (data as unknown as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const applySession = async (sessionUser: User | null) => {
      if (!sessionUser) {
        authState.userId = null;
        setAuthUser(null);
        setUser(null);
        return;
      }
      authState.userId = sessionUser.id;
      setAuthUser(sessionUser);
      // Profile may not exist yet (access request pending) — that is
      // a valid state handled by the AuthGate screen, NOT a fallback user.
      const profile = await fetchProfile(sessionUser.id);
      if (!mounted) return;
      setUser(profile);
    };

    // Initial session check (also consumes OAuth redirect tokens
    // because detectSessionInUrl is enabled).
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      await applySession(data.session?.user ?? null);
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        applySession(null);
      } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        applySession(session?.user ?? null);
      }
      // TOKEN_REFRESHED / USER_UPDATED: identity and profile unchanged.
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos'
        : error.message === 'Email not confirmed'
          ? 'E-mail não confirmado'
          : error.message;
      throw new Error(msg);
    }

    if (data.user) {
      authState.userId = data.user.id;
      setAuthUser(data.user);
      const profile = await fetchProfile(data.user.id);
      setUser(profile);
    }
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });
    // On success the browser leaves the page — nothing else to do.
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    authState.userId = null;
    setAuthUser(null);
    setUser(null);
  };

  const refreshProfile = async (): Promise<boolean> => {
    if (!authState.userId) return false;
    const profile = await fetchProfile(authState.userId);
    setUser(profile);
    return !!profile;
  };

  const isSharks = user?.role === 'admin_sharks' || user?.role === 'sharks_team';
  const isAdmin = user?.role === 'admin_sharks';
  const isClient = user?.role === 'client';

  return (
    <AuthContext.Provider
      value={{ user, authUser, loading, signIn, signInWithGoogle, signOut, refreshProfile, isSharks, isAdmin, isClient }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
