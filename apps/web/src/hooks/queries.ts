import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiMe,
  ApiMeta,
  Exercise,
  JournalEntry,
  JournalValues,
  Program,
  Session,
  SessionExercise,
  TodayResponse,
  UserSettings,
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
