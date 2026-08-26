import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { User as Profile, UserEnvironment, EnvironmentType, EnvironmentRole } from '@/types';
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
  /** Multi-ambiente (migration 023). */
  environments: UserEnvironment[];
  hasAccess: (env: EnvironmentType, roles?: EnvironmentRole[]) => boolean;
  isOracullo: boolean;
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

async function fetchEnvironments(userId: string): Promise<UserEnvironment[]> {
  const { data, error } = await supabase
    .from('user_environments')
    .select('user_id, environment, role, created_at, updated_at')
    .eq('user_id', userId);
  if (error) {
    console.error('[auth] environments load error:', error.message);
    return [];
  }
  return (data as unknown as UserEnvironment[]) ?? [];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [environments, setEnvironments] = useState<UserEnvironment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const applySession = async (sessionUser: User | null) => {
      if (!sessionUser) {
        authState.userId = null;
        setAuthUser(null);
        setUser(null);
        setEnvironments([]);
        return;
      }
      authState.userId = sessionUser.id;
      setAuthUser(sessionUser);
      // Profile may not exist yet (access request pending) — that is
      // a valid state handled by the AuthGate screen, NOT a fallback user.
      const profile = await fetchProfile(sessionUser.id);
      if (!mounted) return;
      setUser(profile);
      const envs = await fetchEnvironments(sessionUser.id);
      if (!mounted) return;
      setEnvironments(envs);
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

  // Realtime: revoga/concessao de ambiente pelo admin Oracullo
  // reage instantaneamente (logout automatico de contexto).
  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel(`auth-env-${authUser.id}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'user_environments', filter: `user_id=eq.${authUser.id}` }, () => {
        fetchEnvironments(authUser.id).then(envs => setEnvironments(envs));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id]);

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
      const envs = await fetchEnvironments(data.user.id);
      setEnvironments(envs);
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
    setEnvironments([]);
  };

  const refreshProfile = async (): Promise<boolean> => {
    if (!authUser) return false;
    const profile = await fetchProfile(authUser.id);
    setUser(profile);
    if (authUser) {
      const envs = await fetchEnvironments(authUser.id);
      setEnvironments(envs);
    }
    return !!profile;
  };

  const isOracullo = user?.role === 'oracullo_admin';
  const hasAccess = (env: EnvironmentType, roles?: EnvironmentRole[]) => {
    if (isOracullo) return true;
    const mine = environments.find(e => e.environment === env);
    if (!mine) return false;
    return !roles || roles.includes(mine.role);
  };
  const isSharks = isOracullo || hasAccess('sharks_company', ['admin', 'team']);
  const isAdmin = isOracullo || hasAccess('sharks_company', ['admin']);
  const isClient = !isSharks && !isOracullo && environments.some(e => e.role === 'client');

  return (
    <AuthContext.Provider
      value={{ user, authUser, loading, signIn, signInWithGoogle, signOut, refreshProfile, environments, hasAccess, isOracullo, isSharks, isAdmin, isClient }}
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
