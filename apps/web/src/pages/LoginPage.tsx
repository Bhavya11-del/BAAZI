import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Crown, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import GoogleSignIn, { isFirebaseConfigured } from '../components/GoogleSignIn';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, initialized, login, register, loginAsGuest, loading } = useAuthStore();

  // If already authenticated, redirect to home (only after auth init)
  useEffect(() => {
    if (!initialized) return;
    if (user) navigate('/', { replace: true });
  }, [user, initialized, navigate]);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
        toast.success('Welcome back! 🎉');
      } else {
        await register(form.email, form.name, form.password);
        toast.success('Account created! 🎊');
      }
      navigate('/lobby');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Something went wrong');
    }
  };

  const handleGuest = async () => {
    await loginAsGuest();
    toast.success('Playing as guest!');
    navigate('/lobby');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-16">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-gold/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="glass-panel gold-border p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-gold to-gold-dark rounded-full flex items-center justify-center mx-auto mb-3 shadow-gold">
              <Crown className="w-8 h-8 text-felt-darker" />
            </div>
            <h1 className="font-cinzel font-bold text-2xl text-shimmer">Card Kings India</h1>
            <p className="text-white/40 text-sm mt-1">Your premium card gaming platform</p>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-black/30 rounded-xl p-1 mb-6">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === m ? 'bg-gold text-felt-darker shadow-gold' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text" placeholder="Your name" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input-field pl-11" required
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="email" placeholder="Email address" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="input-field pl-11" required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type={showPwd ? 'text' : 'password'} placeholder="Password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="input-field pl-11 pr-11" required minLength={6}
              />
              <button type="button" onClick={() => setShowPwd(s => !s)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-gold w-full flex justify-center items-center gap-2">
              {loading ? <span className="thinking-dots"><span/><span/><span/></span> : mode === 'login' ? '🎮 Sign In & Play' : '🎊 Create Account'}
            </button>
          </form>

          {isFirebaseConfigured && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-felt-dark px-3 text-white/30 text-xs">or continue with</span>
                </div>
              </div>

              <GoogleSignIn />
            </>
          )}

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-felt-dark px-3 text-white/30 text-xs">or continue as</span>
            </div>
          </div>

          <button id="guest-login-btn" disabled={loading} onClick={handleGuest}
            className="btn-ghost w-full flex justify-center items-center gap-2">
            Continue as Guest
          </button>

          <p className="text-center text-white/30 text-xs mt-5">
            Guest progress is temporary. Sign in with Google to save your progress.
          </p>

          <p className="text-center text-white/30 text-xs mt-2">
            By playing you agree to fair play. No real money involved.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
