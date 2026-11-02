import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, ExternalLink, FileSpreadsheet, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiMe, LinkSheetResult } from '@suivi/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STEPS = [
  {
    icon: FileSpreadsheet,
    title: 'Ton classeur de suivi',
    text: 'Utilise la copie du classeur que t’a remise ton coach, ou crée un Google Sheets vide — la structure sera installée automatiquement.',
  },
  {
    icon: Share2,
    title: 'Partage-le avec le service',
    text: 'Clique « Partager » dans Google Sheets et ajoute l’adresse ci-dessous en tant qu’éditeur.',
  },
  {
    icon: Check,
    title: 'Colle le lien ici',
    text: 'L’application vérifie l’accès, installe les onglets manquants et n’écrase jamais tes données existantes.',
  },
];

export function SetupPage({ me, onDone }: { me: ApiMe; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LinkSheetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copyEmail = async () => {
    if (!me.serviceAccountEmail) return;
    await navigator.clipboard.writeText(me.serviceAccountEmail);
    toast.success('Adresse copiée');
  };

  async function link(demoUrl?: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<LinkSheetResult>('/me/spreadsheet', {
        url: demoUrl ?? url,
      });
      setResult(r);
      toast.success('Classeur lié !');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Liaison impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="mb-6 text-center">
          <img src="/icon-192.png" alt="SuiViD" className="mx-auto mb-4 size-16 rounded-2xl" />
          <h1 className="text-2xl font-extrabold">Configuration initiale</h1>
          <p className="mt-1 text-sm text-ink-2">
            Tes données vivent dans TON Google Sheets — l'appli s'y connecte.
          </p>
        </div>

        {!result ? (
          <div className="card p-6">
            <ol className="space-y-4">
              {STEPS.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-2 text-accent">
                    <s.icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{s.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            {me.serviceAccountEmail ? (
              <button
                type="button"
                onClick={copyEmail}
                className="mt-5 flex w-full items-center gap-2 rounded-xl border border-dashed border-accent/40 bg-accent-soft/40 px-3 py-2.5 text-left transition-colors hover:bg-accent-soft"
              >
                <Copy className="size-4 shrink-0 text-accent" />
                <span className="truncate text-xs font-semibold text-accent">{me.serviceAccountEmail}</span>
              </button>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-warn">
                Mode démo — la liaison est simulée, aucun accès Google réel.
              </p>
            )}

            <div className="mt-5">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-2">
                Lien de ton classeur
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                inputMode="url"
                onKeyDown={(e) => e.key === 'Enter' && !busy && link()}
              />
              <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-2">
                <ExternalLink className="size-3" /> L'ID dans l'URL suffit aussi.
              </p>
            </div>

            {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}

            <Button
              size="lg"
              className="mt-5 w-full"
              loading={busy}
              disabled={url.trim().length < 5}
              onClick={() => link()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Vérifier et lier mon classeur
            </Button>

            {me.mode === 'mock' && (
              <Button
                variant="ghost"
                className="mt-2 w-full text-ink-2"
                disabled={busy}
                onClick={() => link('demo-mode-classeur-fictif-00000')}
              >
                Passer cette étape (mode démo)
              </Button>
            )}
          </div>
        ) : (
          <div className="card p-6 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="size-7" />
            </div>
            <h2 className="text-lg font-extrabold">Classeur connecté !</h2>
            <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left text-sm text-ink-2">
              {result.created.length > 0 && <li>· {result.created.length} onglet(s) créé(s) : {result.created.join(', ')}</li>}
              {result.seeded.length > 0 && <li>· Structure installée : {result.seeded.join(', ')}</li>}
              {result.programImported && <li>· Programme « Full body » importé</li>}
              {result.created.length === 0 && result.seeded.length === 0 && (
                <li>· Classeur déjà complet — rien à installer</li>
              )}
            </ul>
            <Button size="lg" className="mt-6 w-full" onClick={onDone}>
              Accéder à l'application
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
