import { useState } from 'react';
import { motion } from 'motion/react';
import { Fingerprint } from 'lucide-react';
import { registerPasskey } from '@/lib/webauthn';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

// ------------------------------------------------------------------
// Proposition d'enregistrement de l'empreinte — affichée UNE fois
// après la connexion, seulement si le compte n'a pas de passkey et
// que l'appareil gère la biométrie (voir App.tsx).
// ------------------------------------------------------------------

export function PasskeyOfferPage({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      await registerPasskey();
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Enregistrement annulé — réessaie quand tu veux',
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card w-full max-w-sm p-8 text-center"
      >
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-accent/10">
          <Fingerprint className="size-8 text-accent" />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">Connexion plus rapide</h2>
        <p className="mt-2 text-sm text-ink-2">
          Enregistre l'empreinte de cet appareil pour te connecter en un geste, sans mot de passe.
        </p>
        {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
        <Button size="lg" className="mt-6 w-full" loading={busy} onClick={activate}>
          <Fingerprint className="size-4" />
          Activer l'empreinte
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="mt-4 w-full text-center text-xs font-semibold text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          Plus tard
        </button>
      </motion.div>
    </div>
  );
}
