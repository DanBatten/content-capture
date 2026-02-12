'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import type { User, Session } from '@supabase/supabase-js';

export type UserTier = 'free' | 'pro';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userTier: UserTier;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userTier: 'free',
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const supabase = createBrowserSupabaseClient();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userTier, setUserTier] = useState<UserTier>('free');
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('tier')
        .eq('id', userId)
        .single();

      if (data?.tier === 'pro') {
        setUserTier('pro');
      } else {
        setUserTier('free');
      }
    } catch {
      // Profile might not exist yet (trigger may not have fired)
      setUserTier('free');
    }
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchUserProfile(s.user.id);
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          fetchUserProfile(s.user.id);
        } else {
          setUserTier('free');
        }
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUserProfile]);

  const signIn = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUserTier('free');
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, userTier, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
