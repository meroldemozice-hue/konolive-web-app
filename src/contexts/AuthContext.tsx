import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getProfile } from '@/lib/api';
import type { Profile, UserRole } from '@/types/types';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, profile: null, role: null, session: null,
  loading: true, signOut: async () => {}, refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const p = await getProfile(uid);
    
    const localToken = localStorage.getItem('session_login_token');
    if (p && p.login_token && p.login_token !== localToken && !sessionStorage.getItem('resolving_conflict')) {
      await supabase.auth.signOut();
      setProfile(null);
      setUser(null);
      setSession(null);
      localStorage.removeItem('session_login_token');
      return;
    }

    setProfile(p);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    // Marquer hors ligne AVANT de déconnecter (session encore valide à ce stade)
    if (user) {
      await supabase
        .from('profiles')
        .update({ is_online: false, is_paused: false, login_token: null, is_logged_in: false })
        .eq('id', user.id)
        .then(() => {});
    }
    localStorage.removeItem('session_login_token');
    await supabase.auth.signOut();
    setUser(null); setProfile(null); setSession(null);
  }, [user]);

  useEffect(() => {
    if (!profile || profile.role === 'applicant') return;

    let timeoutId: number;

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(async () => {
        await signOut();
        window.location.href = '/login?timeout=1';
      }, 30 * 60 * 1000); // 30 minutes
    };

    resetTimer();

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => resetTimer();
    
    events.forEach(e => window.addEventListener(e, handleActivity));

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [profile, signOut]);

  return (
    <AuthContext.Provider value={{
      user, profile, role: profile?.role ?? null,
      session, loading, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
