import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardPath } from '@/components/common/RouteGuard';
import { toast } from 'sonner';
import { Video, Eye, EyeOff, LogIn, Download, Smartphone } from 'lucide-react';
import { getApkUrl } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function LoginPage() {
  const navigate = useNavigate();
  const { role, refreshProfile } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const [conflictUser, setConflictUser] = useState<any>(null);

  useEffect(() => {
    getApkUrl().then(url => setApkUrl(url));
    if (window.location.search.includes('timeout=1')) {
      toast.error('Session expirée', { description: 'Vous avez été déconnecté pour inactivité.' });
      window.history.replaceState({}, document.title, '/login');
    }
  }, []);

  // If already logged in, redirect
  React.useEffect(() => {
    if (role && !validating && !conflictUser) navigate(getDashboardPath(role), { replace: true });
  }, [role, navigate, validating, conflictUser]);

  async function finalizeLogin(user: any) {
    const newToken = crypto.randomUUID();
    localStorage.setItem('session_login_token', newToken);
    await supabase.from('profiles').update({ login_token: newToken, is_logged_in: true }).eq('id', user.id);
    sessionStorage.removeItem('resolving_conflict');
    
    await refreshProfile();
    toast.success('Bienvenue !');
    setValidating(false);
    setLoading(false);
    setConflictUser(null);
  }

  async function cancelLogin() {
    await supabase.auth.signOut();
    sessionStorage.removeItem('resolving_conflict');
    setConflictUser(null);
    setValidating(false);
    setLoading(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setValidating(true);
    // Supporte email direct (contient @) ou nom d'utilisateur@miaoda.com
    const email = username.trim().includes('@') ? username.trim() : `${username.trim()}@miaoda.com`;
    
    sessionStorage.setItem('resolving_conflict', 'true');
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      sessionStorage.removeItem('resolving_conflict');
      setLoading(false);
      setValidating(false);
      toast.error('Connexion échouée', { description: 'Identifiant ou mot de passe invalide.' });
      return;
    }

    if (authData?.user) {
      const { data: profile } = await supabase.from('profiles').select('login_token').eq('id', authData.user.id).single();
      
      if (profile?.login_token) {
        setConflictUser(authData.user);
        return;
      }

      await finalizeLogin(authData.user);
    } else {
      sessionStorage.removeItem('resolving_conflict');
      setValidating(false);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--neu-base)' }}>
      <div className="w-full max-w-md">
        {/* Marque */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4"
            style={{ boxShadow: '5px 5px 14px rgba(37,99,235,0.35), -3px -3px 8px rgba(255,255,255,0.2)' }}>
            <Video size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground text-balance">Konolive</h1>
          <p className="text-muted-foreground mt-1 text-sm">Plateforme de vérification d'identité</p>
        </div>

        {/* Carte */}
        <div className="neu-card p-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">Se connecter</h2>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">Nom d'utilisateur ou e-mail</label>
              <input
                className="neu-input"
                placeholder="Entrez votre identifiant"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">Mot de passe</label>
              <div className="relative">
                <input
                  className="neu-input pr-12"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Entrez votre mot de passe"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex justify-end mt-2">
                <Link to="/forgot-password" className="text-xs text-primary font-medium hover:underline">
                  Mot de passe oublié ?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="neu-btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><LogIn size={18} /><span>Se connecter</span></>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Nouveau coach mobile ?{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Créer un compte
            </Link>
          </p>

        </div>

        {/* Mentions légales */}
        <p className="text-center text-xs text-muted-foreground mt-4 px-4">
          En vous connectant, vous acceptez nos{' '}
          <span className="text-primary cursor-pointer hover:underline">Conditions d'utilisation</span>
          {' '}et notre{' '}
          <span className="text-primary cursor-pointer hover:underline">Politique de confidentialité</span>.
        </p>

        {/* ── Bouton Télécharger APK ─────────────────── */}
        {apkUrl && (
          <div className="mt-6 w-full max-w-sm mx-auto px-4 z-10 relative">
            <div className="flex items-center gap-2 justify-center mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                <Smartphone size={12} className="text-primary" />
                Application mobile
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <a
              href={apkUrl}
              download
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl font-semibold text-sm transition-all text-foreground bg-card"
              style={{
                boxShadow: '4px 4px 10px var(--neu-shadow-dark), -4px -4px 10px var(--neu-shadow-light)',
              }}
            >
              <Download size={17} className="text-primary shrink-0" />
              <span>Télécharger l'APK</span>
            </a>
          </div>
        )}

      </div>

      <AlertDialog open={!!conflictUser} onOpenChange={(open) => {
        if (!open && conflictUser) cancelLogin();
      }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Session déjà active</AlertDialogTitle>
            <AlertDialogDescription>
              Une session est déjà ouverte sur un autre appareil pour ce compte. Voulez-vous la déconnecter pour vous connecter ici ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <AlertDialogCancel 
              onClick={(e) => { e.preventDefault(); cancelLogin(); }}
              className="mt-0 sm:mt-0"
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); finalizeLogin(conflictUser); }}
              className="bg-primary text-primary-foreground"
            >
              Forcer la connexion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
