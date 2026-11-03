import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, KeyRound, Mail, ShieldOff, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminCreateUser, useAdminPatchUser, useAdminUsers } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn, formatDateFr } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function AdminClientsPage() {
  const { data: users, isLoading } = useAdminUsers(true);
  const createUser = useAdminCreateUser();
  const patchUser = useAdminPatchUser();
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPass, setNewPass] = useState('');

  const clients = (users ?? []).filter((u) => u.role === 'user');

  const submitCreate = async () => {
    try {
      await createUser.mutateAsync({ email: email.trim(), password });
      toast.success(`Compte créé pour ${email.trim()}`);
      setAddOpen(false);
      setEmail('');
      setPassword('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Création impossible');
    }
  };

  const submitReset = async () => {
    try {
      await patchUser.mutateAsync({ id: resetFor!, password: newPass });
      toast.success('Mot de passe réinitialisé');
      setResetFor(null);
      setNewPass('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Échec');
    }
  };

  return (
    <div>
      <PageHeader title="Espace coach" subtitle="Comptes clients" />
      <AdminSubNav />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-accent" /> Clients · {clients.length}
          </CardTitle>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="size-4" /> Nouveau client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Nouveau compte client</DialogTitle>
              <DialogDescription>Le client se connecte avec ces identifiants.</DialogDescription>
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
                  <Input className="pl-9" type="email" placeholder="email@client.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
                  <Input className="pl-9" type="text" placeholder="Mot de passe temporaire" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button className="w-full" onClick={submitCreate} loading={createUser.isPending} disabled={!email.includes('@') || password.length < 4}>
                  Créer le compte
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading && [1, 2].map((i) => <Skeleton key={i} className="mb-2 h-14 w-full" />)}
          {!isLoading && !clients.length && (
            <EmptyState icon={<Users className="size-6" />} title="Aucun client" description="Crée le premier compte client pour commencer le suivi." />
          )}

          {/* Desktop : tableau */}
          <div className="hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line/60 text-[10px] font-bold uppercase tracking-wider text-ink-2">
                  <th className="pb-2 pr-4">Client</th>
                  <th className="pb-2 pr-4">Membre depuis</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((u) => (
                  <tr key={u.id} className={cn('border-b border-line/30 transition-colors last:border-0 hover:bg-bg-2/70', u.disabled && 'opacity-55')}>
                    <td className="py-3 pr-4">
                      <Link to={`/admin/clients/${u.id}`} className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-extrabold text-accent">
                          {u.email.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-bold">{u.email}</span>
                        <ChevronRight className="size-4 text-ink-2" />
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-xs text-ink-2">{formatDateFr(u.createdAt.slice(0, 10))}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={u.disabled ? 'danger' : 'success'}>{u.disabled ? 'désactivé' : 'actif'}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Réinitialiser le mot de passe" onClick={() => setResetFor(u.id)}>
                          <KeyRound className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('h-8 w-8', u.disabled ? 'text-success' : 'text-ink-2 hover:text-danger')}
                          title={u.disabled ? 'Réactiver' : 'Désactiver'}
                          onClick={() => patchUser.mutate({ id: u.id, disabled: !u.disabled })}
                        >
                          {u.disabled ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile : cartes */}
          <div className="space-y-2 lg:hidden">
            {clients.map((u) => (
              <div key={u.id} className={cn('flex items-center gap-3 rounded-2xl border border-line/60 bg-bg-2/50 p-3.5', u.disabled && 'opacity-55')}>
                <Link to={`/admin/clients/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-extrabold text-accent">
                    {u.email.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{u.email}</p>
                    <p className="text-[11px] text-ink-2">Depuis le {formatDateFr(u.createdAt.slice(0, 10))}</p>
                  </div>
                  {u.disabled && <Badge tone="danger">désactivé</Badge>}
                  <ChevronRight className="size-4 shrink-0 text-ink-2" />
                </Link>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Réinitialiser le mot de passe"
                    onClick={() => setResetFor(u.id)}
                  >
                    <KeyRound className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('h-8 w-8', u.disabled ? 'text-success' : 'text-ink-2 hover:text-danger')}
                    title={u.disabled ? 'Réactiver' : 'Désactiver'}
                    onClick={() => patchUser.mutate({ id: u.id, disabled: !u.disabled })}
                  >
                    {u.disabled ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reset mot de passe */}
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogTitle>Nouveau mot de passe</DialogTitle>
          <DialogDescription>Définis un mot de passe temporaire à transmettre au client.</DialogDescription>
          <div className="mt-4 space-y-3">
            <Input type="text" placeholder="Nouveau mot de passe" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            <Button className="w-full" onClick={submitReset} loading={patchUser.isPending} disabled={newPass.length < 4}>
              Réinitialiser
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
