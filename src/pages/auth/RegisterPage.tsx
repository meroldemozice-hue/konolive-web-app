import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Video, Eye, EyeOff, UserPlus, ChevronDown, Download, Smartphone, CheckCircle2, XCircle, MapPin, MapPinOff, Loader2 } from 'lucide-react';
import { getApkUrl } from '@/lib/api';

const LOCALITIES = [
  'Brazzaville',
  'Pointe-Noire',
  'Bouenza',
  'Congo-Oubangui',
  'Cuvette',
  'Cuvette-Ouest',
  'Djoué-Léfini',
  'Kouilou',
  'Lékoumou',
  'Likouala',
  'Niari',
  'Nkéni-Alima',
  'Plateaux',
  'Pool',
  'Sangha',
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ 
    username: '', 
    locality: '', 
    phone: '', 
    password: '', 
    confirm: '',
    security_question: 'Quel est le nom de votre père ?',
    security_answer: ''
  });
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  
  const [detectingLocality, setDetectingLocality] = useState(true);
  const [localityError, setLocalityError] = useState<string | null>(null);
  const [localityDetected, setLocalityDetected] = useState(false);

  useEffect(() => {
    getApkUrl().then(url => setApkUrl(url));

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            if (!res.ok) throw new Error('API request failed');
            const data = await res.json();
            
            const address = data.address || {};
            const cityName = address.city || address.town || address.village || address.state || address.county || '';
            
            if (cityName) {
              setForm(prev => ({ ...prev, locality: cityName }));
              setLocalityDetected(true);
              setLocalityError(null);
            } else {
              setLocalityError('Impossible de déterminer votre ville à partir de votre position.');
            }
          } catch (err) {
            setLocalityError('Erreur de connexion au service de localisation.');
          } finally {
            setDetectingLocality(false);
          }
        },
        (error) => {
          setDetectingLocality(false);
          setLocalityError("La permission de localisation est requise pour s'inscrire.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setDetectingLocality(false);
      setLocalityError("La géolocalisation n'est pas supportée par votre appareil.");
    }
  }, []);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { toast.error("Veuillez accepter les Conditions d'utilisation"); return; }
    if (!localityDetected || !form.locality) { toast.error("La localisation est requise pour s'inscrire"); return; }
    if (form.password !== form.confirm) { toast.error('Les mots de passe ne correspondent pas'); return; }
    if (form.password.length < 8) { toast.error('Le mot de passe doit contenir au moins 8 caractères'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(form.username)) {
      toast.error("Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscores");
      return;
    }
    if (!form.security_answer.trim()) { toast.error('Veuillez fournir une réponse à la question secrète'); return; }
    
    setLoading(true);
    const email = `${form.username.trim()}@miaoda.com`;
    const { error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: {
          username: form.username.trim(),
          locality: form.locality.trim() || null,
          phone: form.phone.trim() || null,
          security_question: form.security_question,
          security_answer: form.security_answer.trim(),
          role: 'applicant',
        },
      },
    });
    setLoading(false);
    if (error) {
      toast.error('Échec de l\'inscription', { description: error.message });
    } else {
      toast.success('Compte créé ! Veuillez vous connecter.');
      navigate('/login');
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
          <p className="text-muted-foreground mt-1 text-sm">Créer votre compte coach mobile</p>
        </div>

        <div className="neu-card p-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">S'inscrire</h2>
          <form onSubmit={handleRegister} className="space-y-4">

            {/* Nom d'utilisateur */}
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">
                Nom d'utilisateur <span className="text-destructive">*</span>
              </label>
              <input
                className="neu-input"
                placeholder="Ex : Axel, Youb, Dolic…"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Lettres, chiffres et underscores uniquement.</p>
            </div>

            {/* Localité — Automatique via GPS */}
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">Localité</label>
              <div className="relative">
                {detectingLocality ? (
                  <div className="neu-input flex items-center gap-2 text-muted-foreground bg-muted/50 cursor-not-allowed">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Détection de votre position...</span>
                  </div>
                ) : localityError ? (
                  <div className="neu-input flex items-center gap-2 text-destructive bg-destructive/10 border-destructive/20 cursor-not-allowed">
                    <MapPinOff size={16} />
                    <span className="text-sm truncate" title={localityError}>{localityError}</span>
                  </div>
                ) : (
                  <div className="neu-input flex items-center gap-2 text-foreground bg-muted/50 cursor-not-allowed">
                    <MapPin size={16} className="text-primary" />
                    <span>{form.locality}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Votre localité est automatiquement détectée pour votre inscription.</p>
            </div>

            {/* Téléphone */}
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">Numéro de téléphone</label>
              <input
                className="neu-input"
                placeholder="Ex : 064081787"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                type="tel"
              />
            </div>

            {/* Mot de passe */}
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">
                Mot de passe <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  className="neu-input pr-12"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Au moins 8 caractères"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirmer mot de passe */}
            <div>
              <label className="block text-sm font-normal text-foreground mb-2">
                Confirmer le mot de passe <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  className={`neu-input pr-10 ${form.confirm.length > 0 ? (form.password === form.confirm ? '!ring-2 !ring-green-500 !border-transparent' : '!ring-2 !ring-destructive !border-transparent') : ''}`}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Répéter le mot de passe"
                  value={form.confirm}
                  onChange={e => set('confirm', e.target.value)}
                  required
                />
                {form.confirm.length > 0 && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    {form.password === form.confirm ? (
                      <CheckCircle2 size={18} className="text-green-500" />
                    ) : (
                      <XCircle size={18} className="text-destructive" />
                    )}
                  </div>
                )}
              </div>
              {form.confirm.length > 0 && form.password !== form.confirm && (
                <p className="text-xs text-destructive mt-1.5 font-medium ml-1">
                  Les mots de passe ne correspondent pas
                </p>
              )}
              {form.confirm.length > 0 && form.password === form.confirm && (
                <p className="text-xs text-green-500 mt-1.5 font-medium ml-1">
                  Les mots de passe correspondent
                </p>
              )}
            </div>

            {/* Code secret de récupération */}
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-foreground mb-3">Code secret de récupération</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-normal text-foreground mb-2">Question de sécurité</label>
                  <div className="relative">
                    <select
                      className="neu-input appearance-none pr-10 w-full"
                      value={form.security_question}
                      onChange={e => set('security_question', e.target.value)}
                      required
                    >
                      <option value="Quel est le nom de votre père ?">Quel est le nom de votre père ?</option>
                      <option value="Quel est le nom de votre mère ?">Quel est le nom de votre mère ?</option>
                      <option value="Quelle est votre date de naissance ?">Quelle est votre date de naissance ?</option>
                      <option value="Quelle est votre date d'anniversaire ?">Quelle est votre date d'anniversaire ?</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-normal text-foreground mb-2">Réponse secrète</label>
                  <input
                    className="neu-input w-full"
                    type="text"
                    placeholder="Votre réponse..."
                    value={form.security_answer}
                    onChange={e => set('security_answer', e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer min-h-12">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm text-muted-foreground">
                J'accepte les{' '}
                <span className="text-primary hover:underline cursor-pointer">Conditions d'utilisation</span>
                {' '}et la{' '}
                <span className="text-primary hover:underline cursor-pointer">Politique de confidentialité</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !agreed || !localityDetected}
              className="neu-btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><UserPlus size={18} /><span>Créer un compte</span></>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Vous avez déjà un compte ?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">Se connecter</Link>
          </p>

        </div>

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
    </div>
  );
}

