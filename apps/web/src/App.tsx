import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getToken } from '@/lib/api';
import { useMe } from '@/hooks/queries';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/Login';
import { SetupPage } from '@/pages/Setup';
import { AccueilPage } from '@/pages/Accueil';
import { JournalPage } from '@/pages/Journal';
// [NUTRITION] désactivé — imports conservés pour réactivation.
// import { NutritionPage } from '@/pages/Nutrition';
import { SeancesPage } from '@/pages/Seances';
import { ProgrammePage } from '@/pages/Programme';
import { SeanceActivePage } from '@/pages/SeanceActive';
import { SeanceDetailPage } from '@/pages/SeanceDetail';
import { ExercicesPage } from '@/pages/Exercices';
import { ProgresPage } from '@/pages/Progres';
import { ParametresPage } from '@/pages/Parametres';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboard';
import { AdminClientsPage } from '@/pages/admin/AdminClients';
import { AdminClientPage } from '@/pages/admin/AdminClient';
import { AdminProgrammePage } from '@/pages/admin/AdminProgramme';
import { AdminExercicesPage } from '@/pages/admin/AdminExercices';
// import { AdminAlimentsPage } from '@/pages/admin/AdminAliments';

/** Splash pendant la récupération du profil. */
function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <img src="/icon-192.png" alt="SuiViD" className="size-16 animate-pulse rounded-2xl" />
    </div>
  );
}

function AuthedApp() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();

  if (isLoading) return <Splash />;

  // Mode connecté sans classeur lié → configuration initiale obligatoire.
  if (me?.needsSetup) {
    return (
      <SetupPage
        me={me}
        onDone={() => void qc.invalidateQueries()}
      />
    );
  }

  return (
    <Routes>
      {/* Séance active : plein écran, sans navigation (usage en salle) */}
      <Route path="/seance-active" element={<SeanceActivePage />} />
      <Route element={<AppShell />}>
        <Route index element={<AccueilPage />} />
        <Route path="/journal" element={<JournalPage />} />
        {/* [NUTRITION] désactivé — décommenter pour réactiver la page. */}
        {/* <Route path="/nutrition" element={<NutritionPage />} /> */}
        <Route path="/seances" element={<SeancesPage />} />
        <Route path="/seances/:id" element={<SeanceDetailPage />} />
        <Route path="/programmes/:id" element={<ProgrammePage />} />
        <Route path="/exercices" element={<ExercicesPage />} />
        <Route path="/progres" element={<ProgresPage />} />
        <Route path="/parametres" element={<ParametresPage />} />
        {/* Espace coach — visible uniquement pour le rôle 'coach' */}
        {me?.role === 'coach' && (
          <>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/clients" element={<AdminClientsPage />} />
            <Route path="/admin/clients/:id" element={<AdminClientPage />} />
            <Route path="/admin/clients/:id/programmes/:progId" element={<AdminProgrammePage />} />
            <Route path="/admin/exercices" element={<AdminExercicesPage />} />
            {/* [NUTRITION] désactivé — décommenter pour réactiver la page. */}
            {/* <Route path="/admin/aliments" element={<AdminAlimentsPage />} /> */}
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(() => getToken() !== null);

  useEffect(() => {
    const onExpire = () => {
      qc.clear(); // évite les données de l'utilisateur précédent
      setAuthed(false);
    };
    window.addEventListener('suivid:unauthorized', onExpire);
    return () => window.removeEventListener('suivid:unauthorized', onExpire);
  }, [qc]);

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return <AuthedApp />;
}
