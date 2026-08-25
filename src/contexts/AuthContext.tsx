import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';
import { supabase, authState } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isSharks: boolean;
  isAdmin: boolean;
  isClient: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('[auth] profile load error:', error?.message);
    return null;
  }
  return data as unknown as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Initial session check
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const sessionUser = data.session?.user;
      if (sessionUser) {
        authState.userId = sessionUser.id;
        const profile = await fetchProfile(sessionUser.id);
        if (!mounted) return;
        if (profile) {
          setUser(profile);
        } else {
          // Fallback: build from metadata
          const meta = sessionUser.user_metadata || {};
          setUser({
            id: sessionUser.id,
            email: sessionUser.email || '',
            full_name: meta.full_name || sessionUser.email || '',
            avatar_url: null,
            role: meta.role || 'client',
            created_at: sessionUser.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        authState.userId = null;
        setUser(null);
      }
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
      const profile = await fetchProfile(data.user.id);
      if (profile) {
        setUser(profile);
      } else {
        const meta = data.user.user_metadata || {};
        setUser({
          id: data.user.id,
          email: data.user.email || '',
          full_name: meta.full_name || data.user.email || '',
          avatar_url: null,
          role: meta.role || 'client',
          created_at: data.user.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    authState.userId = null;
    setUser(null);
  };

  const refreshProfile = async () => {
    if (!authState.userId) return;
    const profile = await fetchProfile(authState.userId);
    if (profile) setUser(profile);
  };

  const isSharks = user?.role === 'admin_sharks' || user?.role === 'sharks_team';
  const isAdmin = user?.role === 'admin_sharks';
  const isClient = user?.role === 'client';

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refreshProfile, isSharks, isAdmin, isClient }}>
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
