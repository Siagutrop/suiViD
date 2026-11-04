import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Activity,
  Apple,
  Dumbbell,
  FlaskConical,
  Home,
  LineChart,
  LogOut,
  NotebookPen,
  Settings,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { setToken } from '@/lib/api';
import { useMe, useMeta } from '@/hooks/queries';

function logout() {
  setToken(null);
  window.dispatchEvent(new Event('suivid:unauthorized'));
}

// ------------------------------------------------------------------
// Coquille applicative : navigation latérale sur desktop, barre
// inférieure fixe sur mobile — 5 destinations (DA imposée).
// ------------------------------------------------------------------

const NAV = [
  { to: '/', label: 'Accueil', icon: Home },
  { to: '/journal', label: 'Journal', icon: NotebookPen },
  // [NUTRITION] désactivé — décommenter pour réactiver l'onglet.
  // { to: '/nutrition', label: 'Nutrition', icon: Apple },
  { to: '/seances', label: 'Séances', icon: Dumbbell },
  { to: '/exercices', label: 'Exercices', icon: Activity },
  { to: '/progres', label: 'Progrès', icon: LineChart },
];

const COACH_NAV = { to: '/admin', label: 'Coach', icon: Users };

/** Destinations visibles selon le rôle (l'entrée Coach est réservée aux coachs). */
function useNav() {
  const { data: me } = useMe();
  return me?.role === 'coach' ? [...NAV, COACH_NAV] : NAV;
}

function DemoBanner() {
  const { data: meta } = useMeta();
  if (meta?.mode !== 'mock') return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-warn/25 bg-warn/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-warn">
      <FlaskConical className="size-3.5" />
      Mode démo — données fictives, non synchronisées
    </div>
  );
}

function SideNav() {
  const nav = useNav();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-bg-2/60 backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <img src="/icon-192.png" alt="SuiViD" className="size-10 rounded-xl" />
        <div>
          <p className="text-lg font-extrabold tracking-tight">
            SuiVi<span className="text-accent">D</span>
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-2">
            Suivi sportif
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
                isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-line/40 hover:text-ink',
              )
            }
          >
            <Icon className="size-5" strokeWidth={2.2} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 p-3">
        <NavLink
          to="/parametres"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
              isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-line/40 hover:text-ink',
            )
          }
        >
          <Settings className="size-5" strokeWidth={2.2} />
          Paramètres
        </NavLink>
        <UserBlock />
      </div>
    </aside>
  );
}

/** Compte connecté + déconnexion (bas de sidebar desktop). */
function UserBlock() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-line/60 bg-bg-2/60 px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-extrabold text-accent">
        {me.email.slice(0, 1).toUpperCase()}
      </div>
      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-2">{me.email}</p>
      <button
        onClick={logout}
        className="text-ink-2 transition-colors hover:text-danger"
        aria-label="Se déconnecter"
        title="Se déconnecter"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const nav = useNav();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg-2/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className={cn('mx-auto grid max-w-lg', nav.length === 6 ? 'grid-cols-6' : 'grid-cols-5')}>
        {nav.map(({ to, label, icon: Icon }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className="relative flex flex-col items-center gap-1 py-2.5"
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute -top-px h-0.5 w-8 rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <Icon className={cn('size-5', active ? 'text-accent' : 'text-ink-2')} strokeWidth={2.2} />
              <span className={cn('text-[10px] font-bold', active ? 'text-accent' : 'text-ink-2')}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell() {
  const location = useLocation();
  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <SideNav />
      <main className="pb-28 pt-6 lg:ml-60 lg:pb-12 lg:pt-8">
        <div className={cn(
          'mx-auto w-full max-w-3xl px-4 lg:px-8',
          // L'espace coach est pensé desktop : plus de place pour les
          // tableaux et les dispositions en colonnes.
          location.pathname.startsWith('/admin') ? 'lg:max-w-7xl' : 'lg:max-w-5xl',
        )}>
          {/* Transition douce entre les pages */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
