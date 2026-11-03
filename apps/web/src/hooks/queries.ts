import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Aliment,
  AlimentExterne,
  ApiMe,
  ApiMeta,
  ChampCustom,
  ChampValeur,
  Commentaire,
  DashboardClient,
  Exercise,
  JournalAliment,
  JournalEntry,
  JournalValues,
  Program,
  Session,
  SessionExercise,
  TodayResponse,
  UserSettings,
  Photo,
} from '@suivi/shared';
import { addDays, todayInTimezone } from '@suivi/shared';
import { api } from '@/lib/api';

// ------------------------------------------------------------------
// Hooks TanStack Query — couche d'accès unique côté UI.
// ------------------------------------------------------------------

export const keys = {
  me: ['me'] as const,
  meta: ['meta'] as const,
  today: ['journal', 'today'] as const,
  journal: (from: string, to: string) => ['journal', from, to] as const,
  exercices: ['exercices'] as const,
  programmes: ['programmes'] as const,
  programme: (id: string) => ['programmes', id] as const,
  seances: ['seances'] as const,
  seance: (id: string) => ['seances', id] as const,
  lastPerf: ['seances', 'last-perf'] as const,
  parametres: ['parametres'] as const,
  photos: ['photos'] as const,
};

export function useMeta() {
  return useQuery({ queryKey: keys.meta, queryFn: () => api.get<ApiMeta>('/meta'), staleTime: 60_000 });
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<ApiMe>('/me'), staleTime: 60_000 });
}

export function useToday() {
  return useQuery({ queryKey: keys.today, queryFn: () => api.get<TodayResponse>('/journal/today'), staleTime: 15_000 });
}

export function useJournalRange(days: number) {
  const to = todayInTimezone();
  const from = addDays(to, -days);
  return useQuery({
    queryKey: keys.journal(from, to),
    queryFn: () => api.get<JournalEntry[]>(`/journal?from=${from}&to=${to}`),
    staleTime: 30_000,
  });
}

export function useExercices() {
  return useQuery({ queryKey: keys.exercices, queryFn: () => api.get<Exercise[]>('/exercices'), staleTime: 5 * 60_000 });
}

export function useProgrammes() {
  return useQuery({ queryKey: keys.programmes, queryFn: () => api.get<Program[]>('/programmes'), staleTime: 30_000 });
}

export function useProgramme(id: string) {
  return useQuery({ queryKey: keys.programme(id), queryFn: () => api.get<Program>(`/programmes/${id}`) });
}

export function useSeances() {
  return useQuery({ queryKey: keys.seances, queryFn: () => api.get<Session[]>('/seances?limit=60'), staleTime: 30_000 });
}

export function useSeance(id: string) {
  return useQuery({ queryKey: keys.seance(id), queryFn: () => api.get<Session>(`/seances/${id}`) });
}

export function useLastPerf() {
  return useQuery({
    queryKey: keys.lastPerf,
    queryFn: () => api.get<Record<string, { date: string; chargeKg: number | null; repetitions: number | null }[]>>('/seances/last-perf'),
    staleTime: 60_000,
  });
}

export function useParametres() {
  return useQuery({ queryKey: keys.parametres, queryFn: () => api.get<UserSettings>('/parametres'), staleTime: 60_000 });
}

// ---------- Mutations ----------

export function useUpdateToday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { values: Partial<JournalValues>; base?: Partial<JournalValues>; force?: boolean }) =>
      api.put<{ entry: JournalEntry; written: string[] }>('/journal/today', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['journal'] });
    },
  });
}

export function useFinishSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      programmeId?: string | null;
      programmeNom: string;
      debut: string;
      fin: string;
      statut: 'terminee' | 'abandonnee';
      notes?: string | null;
      exercices: SessionExercise[];
    }) => api.post<Session>('/seances', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.seances });
      void qc.invalidateQueries({ queryKey: keys.lastPerf });
    },
  });
}

export function useSaveProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id?: string; nom: string; note?: string | null; exercices: Program['exercices'] }) =>
      body.id
        ? api.put<Program>(`/programmes/${body.id}`, body)
        : api.post<Program>('/programmes', body),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: keys.programmes });
      void qc.invalidateQueries({ queryKey: keys.programme(p.id) });
    },
  });
}

export function useDuplicateProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Program>(`/programmes/${id}/dupliquer`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.programmes }),
  });
}

export function useArchiveProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Program>(`/programmes/${id}/archiver`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.programmes }),
  });
}

export function useSaveParametres() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: UserSettings) => api.put<UserSettings>('/parametres', s),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.parametres }),
  });
}

// ---------- Photos de progression ----------

export function usePhotos() {
  return useQuery({ queryKey: keys.photos, queryFn: () => api.get<Photo[]>('/photos'), staleTime: 30_000 });
}

export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { angle: string; pose?: string; date: string; image: string }) =>
      api.post<Photo>('/photos', p),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.photos }),
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/photos/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.photos }),
  });
}

// ---------- Aliments (bibliothèque + journal) ----------

export function useAliments() {
  return useQuery({ queryKey: ['aliments'], queryFn: () => api.get<Aliment[]>('/aliments'), staleTime: 60_000 });
}

/** Recherche unifiée bibliothèque + Open Food Facts (≥ 2 caractères). */
export function useRechercheAliments(q: string) {
  return useQuery({
    queryKey: ['aliments-recherche', q] as const,
    queryFn: () =>
      api.get<{ locaux: Aliment[]; enLigne: AlimentExterne[] }>(`/aliments/recherche?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useJournalAliments(date: string) {
  return useQuery({
    queryKey: ['journal-aliments', date],
    queryFn: () => api.get<JournalAliment[]>(`/journal/${date}/aliments`),
    staleTime: 10_000,
  });
}

export function useAddJournalAliment(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { alimentId: string; quantiteG: number }) =>
      api.post<JournalAliment>(`/journal/${date}/aliments`, p),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['journal-aliments', date] }),
  });
}

export function useDeleteJournalAliment(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/journal-aliments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['journal-aliments', date] }),
  });
}

/** Modifie la quantité d'une ligne existante. */
export function useUpdateJournalAliment(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; quantiteG: number }) =>
      api.patch<JournalAliment>(`/journal-aliments/${p.id}`, { quantiteG: p.quantiteG }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['journal-aliments', date] }),
  });
}

/** Ajout depuis un résultat externe (OFF) — enregistre l'aliment
 *  en bibliothèque puis le lie au journal en une requête. */
export function useAddAlimentExterne(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      nom: string;
      marque?: string | null;
      codeBarre?: string | null;
      kcal: number;
      proteines: number;
      glucides: number;
      lipides: number;
      quantiteG: number;
    }) => api.post<JournalAliment>(`/journal/${date}/aliments-externe`, p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['journal-aliments', date] });
      void qc.invalidateQueries({ queryKey: ['aliments'] });
      void qc.invalidateQueries({ queryKey: ['aliments-recherche'] });
    },
  });
}

// ---------- Administration (rôle coach) ----------

export interface AdminUser {
  id: string;
  email: string;
  role: 'user' | 'coach';
  disabled: boolean;
  createdAt: string;
}

export interface AdminOverview {
  settings: UserSettings | null;
  journal: JournalEntry[];
  seances: Session[];
  programmes: Program[];
  photos: Photo[];
}

const adminKeys = {
  users: ['admin', 'users'] as const,
  overview: (id: string) => ['admin', 'overview', id] as const,
  exercices: ['admin', 'exercices'] as const,
  aliments: ['admin', 'aliments'] as const,
};

export function useAdminUsers(enabled: boolean) {
  return useQuery({ queryKey: adminKeys.users, queryFn: () => api.get<AdminUser[]>('/admin/users'), enabled });
}

export function useAdminCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { email: string; password: string }) => api.post<AdminUser>('/admin/users', p),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.users }),
  });
}

export function useAdminPatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; disabled?: boolean; role?: 'user' | 'coach'; password?: string }) =>
      api.patch<AdminUser>(`/admin/users/${p.id}`, { disabled: p.disabled, role: p.role, password: p.password }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.users }),
  });
}

export function useAdminOverview(id: string) {
  return useQuery({
    queryKey: adminKeys.overview(id),
    queryFn: () => api.get<AdminOverview>(`/admin/users/${id}/overview`),
    enabled: !!id,
  });
}

interface AdminExercice {
  nom: string;
  muscle: string;
  videoUrl: string;
}

export function useAdminExercices() {
  return useQuery({ queryKey: adminKeys.exercices, queryFn: () => api.get<AdminExercice[]>('/admin/exercices') });
}

export function useAdminSaveExercice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { originalNom?: string; nom: string; muscle: string; videoUrl: string }) =>
      p.originalNom
        ? api.put<AdminExercice>(`/admin/exercices/${encodeURIComponent(p.originalNom)}`, p)
        : api.post<AdminExercice>('/admin/exercices', p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.exercices });
      void qc.invalidateQueries({ queryKey: keys.exercices });
    },
  });
}

export function useAdminDeleteExercice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nom: string) => api.delete<{ ok: boolean }>(`/admin/exercices/${encodeURIComponent(nom)}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.exercices });
      void qc.invalidateQueries({ queryKey: keys.exercices });
    },
  });
}

export function useAdminSaveProgramme(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { progId?: string; nom: string; exercices: unknown[]; statut?: string }) =>
      p.progId
        ? api.put(`/admin/users/${userId}/programmes/${p.progId}`, {
            nom: p.nom,
            exercices: p.exercices,
            statut: p.statut,
          })
        : api.post(`/admin/users/${userId}/programmes`, { nom: p.nom, exercices: p.exercices }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.overview(userId) }),
  });
}

export function useAdminDeleteProgramme(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (progId: string) => api.delete(`/admin/users/${userId}/programmes/${progId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.overview(userId) }),
  });
}

// ---------- Édition complète des données du client ----------

export function useAdminSaveSettings(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: UserSettings) => api.put<UserSettings>(`/admin/users/${userId}/settings`, s),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.overview(userId) }),
  });
}

export function useAdminUpsertJournal(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { date: string; values: Partial<JournalValues> }) =>
      api.put<JournalEntry>(`/admin/users/${userId}/journal/${p.date}`, p.values),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.overview(userId) }),
  });
}

export function useAdminJournalAliments(userId: string, date: string | null) {
  return useQuery({
    queryKey: ['admin', 'journal-aliments', userId, date] as const,
    queryFn: () => api.get<JournalAliment[]>(`/admin/users/${userId}/journal/${date}/aliments`),
    enabled: !!date,
  });
}

export function useAdminAddJournalAliment(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { date: string; alimentId: string; quantiteG: number }) =>
      api.post<JournalAliment>(`/admin/users/${userId}/journal/${p.date}/aliments`, p),
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'journal-aliments', userId, p.date] }),
  });
}

export function useAdminRemoveJournalAliment(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { date: string; ligneId: string }) =>
      api.delete<{ ok: boolean }>(`/admin/users/${userId}/journal/${p.date}/aliments/${p.ligneId}`),
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'journal-aliments', userId, p.date] }),
  });
}

/** Quantité d'une ligne du plan alimentaire client. */
export function useAdminUpdateJournalAliment(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { date: string; ligneId: string; quantiteG: number }) =>
      api.patch<JournalAliment>(`/admin/users/${userId}/journal/${p.date}/aliments/${p.ligneId}`, {
        quantiteG: p.quantiteG,
      }),
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'journal-aliments', userId, p.date] }),
  });
}

export function useAdminDeleteSeance(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seanceId: string) => api.delete<{ ok: boolean }>(`/admin/users/${userId}/seances/${seanceId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.overview(userId) }),
  });
}

export function useAdminDeletePhoto(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api.delete<{ ok: boolean }>(`/admin/users/${userId}/photos/${photoId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.overview(userId) }),
  });
}

// ---------- Champs de suivi personnalisés (coach définit, client remplit) ----------

export function useAdminChamps(userId: string) {
  return useQuery({
    queryKey: ['admin', 'champs', userId] as const,
    queryFn: () => api.get<ChampCustom[]>(`/admin/users/${userId}/champs`),
    enabled: !!userId,
  });
}

export function useAdminSaveChamp(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { champId?: string; nom: string; unite: string }) =>
      p.champId
        ? api.put<ChampCustom>(`/admin/users/${userId}/champs/${p.champId}`, p)
        : api.post<ChampCustom>(`/admin/users/${userId}/champs`, p),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'champs', userId] }),
  });
}

export function useAdminDeleteChamp(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (champId: string) => api.delete<{ ok: boolean }>(`/admin/users/${userId}/champs/${champId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'champs', userId] }),
  });
}

export function useAdminChampValeurs(userId: string, date: string | null) {
  return useQuery({
    queryKey: ['admin', 'champ-valeurs', userId, date] as const,
    queryFn: () => api.get<ChampValeur[]>(`/admin/users/${userId}/journal/${date}/custom`),
    enabled: !!date,
  });
}

// Côté client : définitions + saisie des valeurs dans le journal.
export function useChamps() {
  return useQuery({ queryKey: ['champs'] as const, queryFn: () => api.get<ChampCustom[]>('/champs'), staleTime: 60_000 });
}

export function useChampsValeurs(date: string) {
  return useQuery({
    queryKey: ['champ-valeurs', date] as const,
    queryFn: () => api.get<ChampValeur[]>(`/champs/valeurs?date=${date}`),
  });
}

export function useSetChampValeur(date: string, adminUserId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { champId: string; valeur: string | null }) =>
      adminUserId
        ? api.put<ChampValeur[]>(`/admin/users/${adminUserId}/journal/${date}/custom`, p)
        : api.put<ChampValeur[]>(`/champs/valeurs?date=${date}`, p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['champ-valeurs', date] });
      if (adminUserId) void qc.invalidateQueries({ queryKey: ['admin', 'champ-valeurs', adminUserId, date] });
    },
  });
}

export function useAdminAliments() {
  return useQuery({ queryKey: adminKeys.aliments, queryFn: () => api.get<Aliment[]>('/admin/aliments') });
}

export function useAdminSaveAliment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      id?: string;
      nom: string;
      kcal: number;
      proteines: number;
      glucides: number;
      lipides: number;
      groupe?: string | null;
    }) =>
      p.id
        ? api.put<Aliment>(`/admin/aliments/${p.id}`, p)
        : api.post<Aliment>('/admin/aliments', p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.aliments });
      void qc.invalidateQueries({ queryKey: ['aliments'] });
    },
  });
}

export function useAdminDeleteAliment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/admin/aliments/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.aliments });
      void qc.invalidateQueries({ queryKey: ['aliments'] });
    },
  });
}

/** Import CSV en masse — `nom ; kcal ; P ; G ; L` par ligne. */
export function useAdminImportAliments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => api.post<{ ajoutes: number; ignores: number }>('/admin/aliments/import', { csv }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.aliments });
      void qc.invalidateQueries({ queryKey: ['aliments'] });
      void qc.invalidateQueries({ queryKey: ['aliments-recherche'] });
    },
  });
}

// ---------- Tableau de bord coach ----------

export function useAdminDashboard(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'dashboard'] as const,
    queryFn: () => api.get<DashboardClient[]>('/admin/dashboard'),
    enabled,
    staleTime: 30_000,
  });
}

/** Historique journal complet d'un client (plage libre ou tout). */
export function useAdminJournalRange(userId: string, from: string | null, to: string | null) {
  return useQuery({
    queryKey: ['admin', 'journal-range', userId, from, to] as const,
    queryFn: () =>
      api.get<JournalEntry[]>(
        `/admin/users/${userId}/journal${from && to ? `?from=${from}&to=${to}` : ''}`,
      ),
    enabled: !!userId,
  });
}

/** Copie un programme d'un client vers un autre. */
export function useAdminCopierProgramme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { deUserId: string; progId: string; versUserId: string }) =>
      api.post<Program>('/admin/programmes/copier', p),
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: adminKeys.overview(p.versUserId) }),
  });
}

// ---------- Sauvegardes SQLite ----------

export interface BackupInfo {
  fichier: string;
  taille: number;
  date: string;
}

export function useAdminSauvegardes() {
  return useQuery({
    queryKey: ['admin', 'sauvegardes'] as const,
    queryFn: () => api.get<BackupInfo[]>('/admin/sauvegardes'),
  });
}

export function useAdminBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BackupInfo>('/admin/sauvegardes'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'sauvegardes'] }),
  });
}

// ---------- Commentaires d'une journée (client ↔ coach) ----------

export function useCommentaires(date: string) {
  return useQuery({
    queryKey: ['commentaires', date] as const,
    queryFn: () => api.get<Commentaire[]>(`/journal/${date}/commentaires`),
  });
}

export function useAddCommentaire(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texte: string) => api.post<Commentaire>(`/journal/${date}/commentaires`, { texte }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['commentaires', date] }),
  });
}

export function useDeleteCommentaire(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/journal/commentaires/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['commentaires', date] }),
  });
}

export function useAdminCommentaires(userId: string, date: string | null) {
  return useQuery({
    queryKey: ['admin', 'commentaires', userId, date] as const,
    queryFn: () => api.get<Commentaire[]>(`/admin/users/${userId}/journal/${date}/commentaires`),
    enabled: !!date,
  });
}

export function useAdminAddCommentaire(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { date: string; texte: string }) =>
      api.post<Commentaire>(`/admin/users/${userId}/journal/${p.date}/commentaires`, { texte: p.texte }),
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'commentaires', userId, p.date] }),
  });
}

export function useAdminDeleteCommentaire(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { date: string; cid: string }) =>
      api.delete<{ ok: boolean }>(`/admin/users/${userId}/commentaires/${p.cid}`),
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: ['admin', 'commentaires', userId, p.date] }),
  });
}

// ---------- Compte ----------

export function useChangePassword() {
  return useMutation({
    mutationFn: (p: { actuel: string; nouveau: string }) => api.post<{ ok: boolean }>('/me/motdepasse', p),
  });
}
