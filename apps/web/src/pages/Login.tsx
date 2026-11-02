import { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, UserPlus } from 'lucide-react';
import { api, setToken, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token } = mode === 'login' ? await api.login(email, password) : await api.signup(email, password);
      setToken(token);
      onLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card w-full max-w-sm p-8"
      >
        <div className="mb-8 flex flex-col items-center gap-4">
          <img src="/icon-192.png" alt="SuiViD" className="size-20 rounded-2xl" />
          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-tight">
              SuiVi<span className="text-accent">D</span>
            </h1>
            <p className="mt-1 text-sm text-ink-2">Suivi sportif & nutrition</p>
          </div>
        </div>

        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-2">
          E-mail
        </label>
        <div className="relative mb-4">
          <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.fr"
            autoFocus
            autoComplete="email"
            required
            className="pl-10"
          />
        </div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-2">
          Mot de passe
        </label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'signup' ? 6 : 1}
        />
        {mode === 'signup' && (
          <p className="mt-2 text-xs text-ink-2">6 caractères minimum.</p>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <Button type="submit" size="lg" className="mt-6 w-full" loading={loading}>
          {mode === 'login' ? <Lock className="size-4" /> : <UserPlus className="size-4" />}
          {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
        </Button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs font-semibold text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          {mode === 'login' ? "Pas de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
        </button>
      </motion.form>
    </div>
  );
}
