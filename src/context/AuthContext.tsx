import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      // Initialise from persisted session
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      }).catch((err) => {
        console.warn('[Auth] Failed to get session:', err);
        setLoading(false);
      });

      // Subscribe to auth state changes.
      // IMPORTANT: The callback must be synchronous — awaiting Supabase methods
      // inside an onAuthStateChange callback causes a deadlock because the SDK
      // processes events synchronously. Use a fire-and-forget async IIFE if
      // async work is ever needed here.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
      });

      return () => subscription.unsubscribe();
    } catch (err) {
      console.warn('[Auth] Failed to initialize auth:', err);
      setLoading(false);
    }
  }, []);

  async function signIn(email: string, password: string) {
    // Demo account — bypasses Supabase, works without internet
    if (email === 'anjuna' && password === 'uplift') {
      const demoSession = {
        access_token: 'demo',
        refresh_token: 'demo',
        expires_in: 86400,
        expires_at: Date.now() / 1000 + 86400,
        token_type: 'bearer',
        user: {
          id: 'demo-user',
          email: 'anjuna@demo',
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
        },
      } as unknown as Session;
      setSession(demoSession);
      return { error: null };
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Login request timed out. Please check your internet connection.')), 15000)
      );
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        timeoutPromise
      ]);
      return { error: error?.message ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      return { error: message };
    }
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
