import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getToken } from '@/lib/api';
import { keys, useMe, usePasskeys } from '@/hooks/queries';
import { biometryAvailable, markPasskeyOfferSeen, passkeyOfferSeen } from '@/lib/webauthn';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/Login';
import { SetupPage } from '@/pages/Setup';
import { PasskeyOfferPage } from '@/pages/PasskeyOffer';
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
  const { data: passkeys } = usePasskeys();
  const qc = useQueryClient();
  const [offer, setOffer] = useState(false);

  // Enregistrement de l'empreinte proposé une seule fois : serveur
  // WebAuthn actif, compte sans passkey, appareil biométrique, et
  // proposition pas déjà déclinée pour ce compte sur cet appareil.
  useEffect(() => {
    let alive = true;
    if (
      me &&
      !me.needsSetup &&
      me.webauthn.enabled &&
      passkeys &&
      passkeys.length === 0 &&
      !passkeyOfferSeen(me.id)
    ) {
      void biometryAvailable().then((ok) => {
        if (alive && ok) setOffer(true);
      });
    }
    return () => {
      alive = false;
    };
  }, [me, passkeys]);

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

  if (me && offer) {
    return (
      <PasskeyOfferPage
        onDone={() => {
          markPasskeyOfferSeen(me.id);
          setOffer(false);
          void qc.invalidateQueries({ queryKey: keys.passkeys });
        }}
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
