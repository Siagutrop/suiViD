// Fil d'échanges du jour — le client y laisse un ressenti ou une
// question, le coach y répond depuis la fiche client. Un fil par date.

import { useState } from 'react';
import { MessageSquareText, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAddCommentaire, useCommentaires, useDeleteCommentaire } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function JournalCommentaires({ date }: { date: string }) {
  const { data: fil } = useCommentaires(date);
  const add = useAddCommentaire(date);
  const del = useDeleteCommentaire(date);
  const [texte, setTexte] = useState('');

  const envoyer = async () => {
    if (!texte.trim()) return;
    try {
      await add.mutateAsync(texte.trim());
      setTexte('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Envoi impossible');
    }
  };

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-violet" /> Échanges avec le coach
          {!!fil?.length && <span className="text-xs font-semibold text-ink-2">· {fil.length}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {(fil ?? []).map((c) => (
            <div
              key={c.id}
              className={cn(
                'group flex items-start gap-2 rounded-xl px-3 py-2 text-sm',
                c.auteur === 'coach' ? 'bg-violet/15' : 'bg-bg-2/70',
              )}
            >
              <span className={cn('mt-0.5 shrink-0 text-[9px] font-bold uppercase', c.auteur === 'coach' ? 'text-violet' : 'text-accent')}>
                {c.auteur === 'coach' ? 'Coach' : 'Toi'}
              </span>
              <span className="min-w-0 flex-1">{c.texte}</span>
              {c.auteur === 'client' && (
                <button
                  onClick={() => del.mutate(c.id)}
                  className="shrink-0 text-ink-2 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  aria-label="Supprimer le message"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {!fil?.length && (
            <p className="text-sm text-ink-2">
              Ressenti, douleur, question sur la journée — le coach te répond ici.
            </p>
          )}
        </div>
        <div className="mt-2.5 flex gap-2">
          <Input
            placeholder="Écris un message au coach…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && envoyer()}
          />
          <Button size="sm" variant="secondary" onClick={envoyer} loading={add.isPending} disabled={!texte.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
