import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { createReadStream } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  finishSessionSchema,
  journalValuesSchema,
  linkSheetSchema,
  loginSchema,
  programSchema,
  provisionSchema,
  signupSchema,
  updateJournalSchema,
  userSettingsSchema,
  REQUIRED_NEW_TABS,
  SHEET_FULL_BODY,
  SHEET_LISTE,
  SHEET_SUIVI,
  type ApiMe,
  type ApiMeta,
  type LinkSheetResult,
  type UserSettings,
} from '@suivi/shared';
import { AuthService } from './auth.js';
import type { Env } from './env.js';
import { AppError, ERR, toApiError } from './errors.js';
import { MockProvider } from './providers/MockProvider.js';
import { SheetsProvider, serviceAccountEmail } from './providers/SheetsProvider.js';
import type { DataProvider } from './providers/DataProvider.js';
import { buildMockGrid } from './mock/seed.js';
import { provisionSpreadsheet, parseSpreadsheetId } from './provision.js';
import { DEMO_USER_EMAIL, DEMO_USER_PASSWORD, UserStore } from './users/store.js';
import type { UserRecord } from './users/store.js';
import { DailyTrackingRepository } from './repositories/DailyTrackingRepository.js';
import { ExerciseRepository } from './repositories/ExerciseRepository.js';
import { ProgramRepository } from './repositories/ProgramRepository.js';
import { SessionRepository } from './repositories/SessionRepository.js';
import { SettingsRepository } from './repositories/SettingsRepository.js';
import { reportSessionToFullBody } from './repositories/FullBodyReporter.js';
import { PhotoStore } from './photos.js';
import { defaultUsersFile } from './users/store.js';

// ------------------------------------------------------------------
// Multi-utilisateur : chaque requête est résolue vers le contexte de
// données de SON utilisateur (son propre classeur Google Sheets, ou le
// provider mock partagé en mode démo).
// ------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

/** Repositories liés à un provider (un par classeur). */
interface DataCtx {
  provider: DataProvider;
  journal: DailyTrackingRepository;
  exercises: ExerciseRepository;
  programs: ProgramRepository;
  sessions: SessionRepository;
  settings: SettingsRepository;
}

function buildDataCtx(provider: DataProvider): DataCtx {
  return {
    provider,
    journal: new DailyTrackingRepository(provider, 'Europe/Paris'),
    exercises: new ExerciseRepository(provider),
    programs: new ProgramRepository(provider),
    sessions: new SessionRepository(provider, 'Europe/Paris'),
    settings: new SettingsRepository(provider),
  };
}

export interface AppContext {
  env: Env;
  users: UserStore;
  auth: AuthService;
  /** Contexte partagé du mode démo (un seul provider fictif). */
  mockCtx: DataCtx | null;
  /** Cache des contextes par spreadsheetId (mode sheets). */
  cache: Map<string, DataCtx>;
  /** Résout userId -> utilisateur + contexte de données. */
  forUser(userId: string): Promise<{ user: UserRecord } & DataCtx>;
}

export function buildContext(env: Env, provider?: DataProvider): AppContext {
  const users = new UserStore(env);
  const mockCtx =
    env.DATA_MODE === 'mock' ? buildDataCtx(provider ?? new MockProvider(buildMockGrid(), env.MOCK_STORE_FILE)) : null;
  if (mockCtx && users.list().length === 0) {
    // Compte démo : synchrone (en mémoire), persistance déclenchée.
    const u = users.create(DEMO_USER_EMAIL, env.DEMO_PASSWORD ?? DEMO_USER_PASSWORD);
    u.spreadsheetId = 'demo';
    void users.persist();
  }

  const cache = new Map<string, DataCtx>();

  const forUser: AppContext['forUser'] = async (userId) => {
    const user = users.byId(userId);
    if (!user) throw new AppError(401, ERR.UNAUTHORIZED, 'Compte introuvable');
    if (mockCtx) return { user, ...mockCtx };
    const spreadsheetId = user.spreadsheetId ?? env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      throw new AppError(
        400,
        ERR.TABS_MISSING,
        'Aucun classeur lié — terminez la configuration initiale',
      );
    }
    let ctx = cache.get(spreadsheetId);
    if (!ctx) {
      ctx = buildDataCtx(new SheetsProvider(env, spreadsheetId));
      cache.set(spreadsheetId, ctx);
    }
    return { user, ...ctx };
  };

  return {
    env,
    users,
    auth: new AuthService(env, users),
    mockCtx,
    cache,
    forUser,
  };
}

function normalizeExercices<
  T extends { repsCible?: string | null; variante?: string | null; notes?: string | null; reposSec?: number | null },
>(list: T[]) {
  return list.map((e) => ({
    ...e,
    repsCible: e.repsCible ?? null,
    variante: e.variante ?? null,
    notes: e.notes ?? null,
    reposSec: e.reposSec ?? null,
  }));
}

/** Valide le body avec un schéma Zod, lève AppError 400. */
function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: (string | number)[]; message: string }[] } } }, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AppError(400, ERR.VALIDATION, `Données invalides — ${msg}`, r.error!.issues);
  }
  return r.data!;
}

function maskId(id: string | null): string | null {
  return id ? '•••' + id.slice(-6) : null;
}

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      ctx.env.LOG_LEVEL === 'debug'
        ? { level: 'debug', transport: { target: 'pino-pretty' } }
        : { level: ctx.env.LOG_LEVEL },
  });

  await app.register(cors, {
    origin: ctx.env.CORS_ORIGIN === '*' ? true : ctx.env.CORS_ORIGIN.split(','),
    credentials: false,
  });

  app.setErrorHandler((err, _req, reply) => {
    const { status, body } = toApiError(err);
    if (status >= 500) app.log.error(err);
    void reply.status(status).send(body);
  });

  const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/signup']);
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    if (PUBLIC_PATHS.has(req.url.split('?')[0]!)) return;
    req.userId = await ctx.auth.verify(req.headers.authorization);
  });

  const u = (req: FastifyRequest) => ctx.forUser(req.userId!);

  // ---------- Santé & méta ----------
  app.get('/api/health', async () => ({ status: 'ok', mode: ctx.env.DATA_MODE }));

  app.get('/api/meta', async (req): Promise<ApiMeta> => {
    const { user, provider } = await u(req);
    let tabs: Record<string, boolean> = {};
    try {
      const names = await provider.listSheets();
      for (const t of [SHEET_SUIVI, SHEET_LISTE, SHEET_FULL_BODY, ...REQUIRED_NEW_TABS]) {
        tabs[t] = names.includes(t);
      }
    } catch {
      tabs = {};
    }
    return {
      mode: ctx.env.DATA_MODE,
      version: '0.2.0',
      spreadsheetId: maskId(user.spreadsheetId),
      tabs,
    };
  });

  // ---------- Auth ----------
  app.post('/api/auth/signup', async (req) => {
    const { email, password } = parse(signupSchema, req.body);
    const { token, expiresIn, user } = await ctx.auth.signup(email, password, req.ip);
    return { token, expiresIn, email: user.email };
  });

  app.post('/api/auth/login', async (req) => {
    const { email, password } = parse(loginSchema, req.body);
    const { token, expiresIn, user } = await ctx.auth.login(email, password, req.ip);
    return { token, expiresIn, email: user.email };
  });

  // ---------- Compte & liaison du classeur ----------
  app.get('/api/me', async (req): Promise<ApiMe> => {
    const user = ctx.users.byId(req.userId!);
    if (!user) throw new AppError(401, ERR.UNAUTHORIZED, 'Compte introuvable');
    return {
      id: user.id,
      email: user.email,
      mode: ctx.env.DATA_MODE,
      needsSetup: !user.spreadsheetId,
      spreadsheetId: maskId(user.spreadsheetId),
      serviceAccountEmail: serviceAccountEmail(ctx.env),
    };
  });

  /** Lie un classeur : vérifie l'accès, provisionne, mémorise l'ID. */
  app.post('/api/me/spreadsheet', async (req): Promise<LinkSheetResult> => {
    const { url } = parse(linkSheetSchema, req.body);
    const id = parseSpreadsheetId(url);
    if (!id) {
      throw new AppError(400, ERR.VALIDATION, 'Lien ou identifiant de classeur invalide');
    }
    if (ctx.env.DATA_MODE !== 'sheets') {
      // Mode démo : liaison simulée — le provider mock sert les mêmes
      // données fictives quel que soit l'ID stocké.
      await ctx.users.setSpreadsheet(req.userId!, 'demo');
      return {
        linked: true,
        created: [],
        seeded: ['Classeur fictif (mode démo)'],
        programImported: false,
        tabs: ['Suivi', 'Liste', 'Full body', 'Bilan', 'Programmes', 'Seances'],
      };
    }
    const provider = new SheetsProvider(ctx.env, id);
    // Validation d'accès — remonte une erreur claire si non partagé.
    try {
      await provider.listSheets();
    } catch (err) {
      if (err instanceof AppError) {
        throw new AppError(
          400,
          ERR.VALIDATION,
          'Classeur inaccessible — vérifie que tu l’as partagé avec le compte de service ' +
            `(droit « Éditeur ») : ${err.message}`,
        );
      }
      throw err;
    }
    const result = await provisionSpreadsheet(provider);
    await ctx.users.setSpreadsheet(req.userId!, id);
    ctx.cache.delete(id); // force la reconstruction du contexte
    return { linked: true, ...result };
  });

  /** Re-provisionnement explicite (onglets applicatifs manquants). */
  app.post('/api/me/provision', async (req): Promise<LinkSheetResult> => {
    parse(provisionSchema, req.body);
    const { provider } = await u(req);
    const result = await provisionSpreadsheet(provider);
    return { linked: true, ...result };
  });

  // ---------- Photos de progression (fichiers sur disque, pas dans Sheets) ----------
  const photoStore = new PhotoStore(
    dirname(ctx.env.USERS_FILE ?? defaultUsersFile()) + '/photos',
  );
  const photoUploadSchema = z.object({
    angle: z.enum(['face', 'profil', 'profil-droit', 'profil-gauche', 'dos']),
    pose: z.enum(['relache', 'contracte']).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    image: z.string().startsWith('data:image/'),
  });

  app.get('/api/photos', async (req) => photoStore.list(req.userId!));

  app.post('/api/photos', { bodyLimit: 30 * 1024 * 1024 }, async (req) => {
    const { angle, pose, date, image } = parse(photoUploadSchema, req.body);
    return photoStore.add(req.userId!, angle, image, date, pose);
  });

  app.get('/api/photos/:id/file', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { filePath, ext } = await photoStore.file(req.userId!, id);
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return reply
      .type(mime)
      .header('Cache-Control', 'private, max-age=3600')
      .send(createReadStream(filePath));
  });

  app.delete('/api/photos/:id', async (req) => {
    const { id } = req.params as { id: string };
    await photoStore.remove(req.userId!, id);
    return { ok: true };
  });

  // ---------- Journal ----------
  app.get('/api/journal/today', async (req) => (await u(req)).journal.getToday());

  app.put('/api/journal/today', async (req) => {
    const { values, base, force } = parse(updateJournalSchema, req.body);
    return (await u(req)).journal.updateToday(values, base, force ?? false);
  });

  app.get('/api/journal', async (req) => {
    const q = req.query as { from?: string; to?: string; recent?: string };
    const j = (await u(req)).journal;
    if (q.recent) return j.getRecent(Math.min(Number(q.recent) || 7, 90));
    if (!q.from || !q.to) {
      throw new AppError(400, ERR.VALIDATION, 'Paramètres from/to requis (YYYY-MM-DD)');
    }
    return j.getRange(q.from, q.to);
  });

  // ---------- Exercices ----------
  app.get('/api/exercices', async (req) => (await u(req)).exercises.list());

  // ---------- Programmes ----------
  app.get('/api/programmes', async (req) => (await u(req)).programs.list());

  app.get('/api/programmes/:id', async (req) =>
    (await u(req)).programs.get((req.params as { id: string }).id),
  );

  app.post('/api/programmes', async (req) => {
    const body = parse(programSchema, req.body);
    return (await u(req)).programs.create({
      nom: body.nom,
      note: body.note ?? null,
      exercices: normalizeExercices(body.exercices),
    });
  });

  app.put('/api/programmes/:id', async (req) => {
    const body = parse(programSchema.partial(), req.body);
    return (await u(req)).programs.update((req.params as { id: string }).id, {
      nom: body.nom,
      statut: body.statut,
      note: body.note,
      exercices: body.exercices ? normalizeExercices(body.exercices) : undefined,
    });
  });

  app.post('/api/programmes/:id/dupliquer', async (req) =>
    (await u(req)).programs.duplicate((req.params as { id: string }).id),
  );

  app.post('/api/programmes/:id/archiver', async (req) =>
    (await u(req)).programs.archive((req.params as { id: string }).id),
  );

  // ---------- Séances ----------
  app.get('/api/seances', async (req) => {
    const q = req.query as { limit?: string; last?: string };
    const s = (await u(req)).sessions;
    if (q.last === '1') return s.lastSession();
    return s.list(Math.min(Number(q.limit) || 50, 200));
  });

  app.get('/api/seances/last-perf', async (req) =>
    Object.fromEntries(await (await u(req)).sessions.lastPerformanceByExercise()),
  );

  app.get('/api/seances/:id', async (req) =>
    (await u(req)).sessions.get((req.params as { id: string }).id),
  );

  app.post('/api/seances', async (req) => {
    const body = parse(finishSessionSchema, req.body);
    const dataCtx = await u(req);
    const session = await dataCtx.sessions.finish({
      programmeId: body.programmeId ?? null,
      programmeNom: body.programmeNom,
      debut: body.debut,
      fin: body.fin,
      statut: body.statut,
      notes: body.notes ?? null,
      exercices: body.exercices.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ ...s, notes: s.notes ?? null })),
      })),
    });
    // Report coach : remplit le bloc « Full body » correspondant.
    // Un échec ici ne doit jamais faire perdre la séance enregistrée.
    try {
      const report = await reportSessionToFullBody(dataCtx.provider, session);
      if (report) {
        req.log.info(
          { block: report.blockTitleRow, appended: report.appendedBlock, cells: report.cellsWritten },
          'Séance reportée dans Full body',
        );
      }
    } catch (err) {
      req.log.warn({ err }, 'Report Full body échoué (séance enregistrée)');
    }
    return session;
  });

  // ---------- Paramètres ----------
  app.get('/api/parametres', async (req) => (await u(req)).settings.get());

  app.put('/api/parametres', async (req) => {
    const body = parse(userSettingsSchema, req.body);
    return (await u(req)).settings.update(body as UserSettings);
  });

  // Schéma journal exposé au frontend pour validation locale
  app.get('/api/schemas/journal', async () => journalValuesSchema.describe('journal'));

  return app;
}
