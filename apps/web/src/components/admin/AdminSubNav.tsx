import { NavLink } from 'react-router-dom';
import { Apple, Dumbbell, LayoutDashboard, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/admin/clients', label: 'Clients', icon: Users },
  { to: '/admin/exercices', label: 'Exercices', icon: Dumbbell },
  // [NUTRITION] désactivé — décommenter pour réactiver l'onglet.
  // { to: '/admin/aliments', label: 'Aliments', icon: Apple },
];

/** Sous-navigation de l'espace coach. */
export function AdminSubNav() {
  return (
    <div className="mb-5 flex gap-2">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn('chip', isActive && 'chip-active')
          }
        >
          <Icon className="size-4" /> {label}
        </NavLink>
      ))}
    </div>
  );
}
