// Tableau de bord coach — vue d'ensemble des athlètes : activité de la
// semaine, alertes de suivi et état des sauvegardes de la base.

import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Camera,
  ChevronRight,
  Dumbbell,
  HardDriveDownload,
  Loader2,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  Users,
  Weight,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Alerte, DashboardClient } from '@suivi/shared';
import {
  useAdminBackup,
  useAdminDashboard,
  useAdminSauvegardes,
  useMe,
} from '@/hooks/queries';
import { cn, formatDateFr } from '@/lib/utils';
import { AdminSubNav } from '@/components/admin/AdminSubNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ALERTE_ICON: Record<Alerte['type'], typeof AlertTriangle> = {
  silence: Activity,
  pesee: Weight,
  seances: Dumbbell,
  photos: Camera,
};

export function AdminDashboardPage() {
  const { data: me } = useMe();
  const { data: clients, isLoading } = useAdminDashboard(me?.role === 'coach');
  const { data: sauvegardes } = useAdminSauvegardes();
  const backup = useAdminBackup();

  const actifs = clients?.filter((c) => !c.disabled) ?? [];
  const nbAlertes = actifs.reduce((n, c) => n + c.alertes.length, 0);
  const seancesSemaine = actifs.reduce((n, c) => n + c.seancesSemaine, 0);
  const saisiesSemaine = actifs.reduce((n, c) => n + c.journalSemaine, 0);

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble de tes athlètes" />
      <AdminSubNav />

      {/* Résumé de la semaine */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resume label="Athlètes actifs" value={String(actifs.length)} icon={Users} />
        <Resume label="Alertes" value={String(nbAlertes)} icon={AlertTriangle} tone={nbAlertes > 0 ? 'warn' : 'good'} />
        <Resume label="Séances cette semaine" value={String(seancesSemaine)} icon={Dumbbell} />
        <Resume label="Saisies journal (7 j)" value={String(saisiesSemaine)} icon={Activity} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* Table des athlètes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-accent" /> Athlètes · {actifs.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && <p className="px-5 py-8 text-center text-sm text-ink-2">Chargement…</p>}
            {!isLoading && !actifs.length && (
              <p className="px-5 py-8 text-center text-sm text-ink-2">
                Aucun athlète pour l'instant — crée un compte depuis l'onglet Clients.
              </p>
            )}
            {!!actifs.length && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-ink-2">
                      <th className="px-5 py-3">Athlète</th>
                      <th className="px-4 py-3">Dernière saisie</th>
                      <th className="px-4 py-3">Séances sem.</th>
                      <th className="px-4 py-3">Poids</th>
                      <th className="px-4 py-3">Photos</th>
                      <th className="px-5 py-3">Alertes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actifs.map((c) => (
                      <ClientRow key={c.id} client={c} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sauvegardes */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDriveDownload className="size-4 text-violet" /> Sauvegardes
            </CardTitle>
            <Button
              size="sm"
              variant="secondary"
              disabled={backup.isPending}
              onClick={() =>
                backup.mutate(undefined, {
                  onSuccess: () => toast.success('Sauvegarde créée'),
                  onError: () => toast.error('Sauvegarde impossible'),
                })
              }
            >
              {backup.isPending ? <Loader2 className="size-4 animate-spin" /> : <HardDriveDownload className="size-4" />}
              Sauvegarder
            </Button>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-[11px] text-ink-2">
              Copie automatique quotidienne au démarrage — 10 dernières conservées dans <code>data/backups/</code>.
            </p>
            <ul className="space-y-1.5">
              {(sauvegardes ?? []).slice(0, 5).map((s) => (
                <li key={s.fichier} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-ink-2">{s.fichier.replace('suivid-', '').replace('.db', '')}</span>
                  <span className="text-ink-2">{(s.taille / 1024 / 1024).toFixed(1)} Mo</span>
                </li>
              ))}
              {!sauvegardes?.length && <li className="text-xs text-ink-2">Aucune sauvegarde pour l'instant.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Resume({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  tone?: 'warn' | 'good';
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-2">
        <Icon className="size-3.5" /> {label}
      </p>
      <p
        className={cn(
          'num-display mt-1.5 text-2xl',
          tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-success' : '',
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function ClientRow({ client: c }: { client: DashboardClient }) {
  return (
    <tr className="group border-b border-line/60 transition-colors last:border-0 hover:bg-bg-2/60">
      <td className="px-5 py-3.5">
        <Link to={`/admin/clients/${c.id}`} className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
            {c.email[0]!.toUpperCase()}
          </span>
          <span className="max-w-[220px] truncate font-semibold group-hover:text-accent">{c.email}</span>
          <ChevronRight className="size-4 text-ink-2 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      </td>
      <td className="px-4 py-3.5 text-ink-2">
        {c.dernierJournal ? (
          <>
            {formatDateFr(c.dernierJournal)}
            <span className="block text-[10px]">{c.journalSemaine} saisie{c.journalSemaine > 1 ? 's' : ''} / 7 j</span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3.5">
        <span className={cn('font-bold', c.seancesPrevues > 0 && c.seancesSemaine < c.seancesPrevues ? 'text-warn' : '')}>
          {c.seancesSemaine}
          {c.seancesPrevues > 0 ? `/${c.seancesPrevues}` : ''}
        </span>
      </td>
      <td className="px-4 py-3.5">
        {c.poids != null ? (
          <span className="flex items-center gap-1 font-semibold">
            {c.poids} kg
            {c.poidsDelta7 != null && (
              <span className={cn('flex items-center text-[11px]', c.poidsDelta7 <= 0 ? 'text-success' : 'text-warn')}>
                {c.poidsDelta7 <= 0 ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
                {c.poidsDelta7 > 0 ? '+' : ''}
                {c.poidsDelta7}
              </span>
            )}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3.5 text-ink-2">
        {c.dernierePhoto ? (
          <>
            {formatDateFr(c.dernierePhoto)}
            <span className="block text-[10px]">{c.nbPhotos} photo{c.nbPhotos > 1 ? 's' : ''}</span>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="px-5 py-3.5">
        {c.alertes.length ? (
          <div className="flex flex-col items-start gap-1">
            {c.alertes.map((a, i) => {
              const Icon = ALERTE_ICON[a.type] ?? AlertTriangle;
              return (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-lg bg-warn/10 px-2 py-1 text-left text-[10px] font-bold leading-tight text-warn"
                >
                  <Icon className="size-3 shrink-0" /> {a.message}
                </span>
              );
            })}
          </div>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-success">
            <MessageSquare className="size-3" /> RAS
          </span>
        )}
      </td>
    </tr>
  );
}
