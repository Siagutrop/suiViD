// ------------------------------------------------------------------
// Routes réservées au coach (role = 'coach') : gestion des comptes,
// bibliothèque d'exercices globale, programmes des clients, suivi,
// bibliothèque d'aliments. Enregistrées par registerAdminRoutes().
// ------------------------------------------------------------------

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  JOURNAL_FIELDS,
  SHEET_LISTE,
  addDays,
  todayInTimezone,
  type Alerte,
  type DashboardClient,
} from '@suivi/shared';
import type { AppContext } from './app.js';
import { AppError, ERR } from './errors.js';
import type { AlimentStore } from './aliments.js';
import type { ChampStore } from './champs.js';
import type { CommentaireStore } from './commentaires.js';
import type { PhotoStore } from './photos.js';
import type { CellValue } from './providers/DataProvider.js';
import { backupDb, listBackups } from './backup.js';
import type { UserRecord } from './users/store.js';

const exerciseSchema = z.object({
  nom: z.string().min(1).max(120),
  muscle: z.string().min(1).max(60),
  videoUrl: z.string().max(500).default(''),
});

const alimentSchema = z.object({
  nom: z.string().min(1).max(160),
  kcal: z.number().min(0).max(5000),
  proteines: z.number().min(0).max(500),
  glucides: z.number().min(0).max(500),
  lipides: z.number().min(0).max(500),
  codeBarre: z.string().max(30).nullish(),
  groupe: z.string().max(60).nullish(),
});

const createUserSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(4).max(200),
});

const patchUserSchema = z.object({
  disabled: z.boolean().optional(),
  role: z.enum(['user', 'coach']).optional(),
  password: z.string().min(4).max(200).optional(),
});

const programSchemaAdmin = z.object({
  nom: z.string().min(1).max(120).optional(),
  note: z.string().max(300).nullish(),
  statut: z.enum(['actif', 'archive']).optional(),
  exercices: z
    .array(
      z.object({
        exercice: z.string().min(1),
        ordre: z.number().int().optional(),
        series: z.number().int().min(1).max(20),
        repsCible: z.string().max(30).nullish(),
        variante: z.string().max(120).nullish(),
        notes: z.string().max(300).nullish(),
        reposSec: z.number().int().min(0).max(900).nullish(),
      }),
    )
    .optional(),
});

const settingsSchema = z.object({
  objectifPoids: z.number().min(0).max(1000).nullable(),
  objectifCalories: z.number().min(0).max(20000).nullable(),
  objectifProteines: z.number().min(0).max(2000).nullable(),
  objectifGlucides: z.number().min(0).max(2000).nullable(),
  objectifLipides: z.number().min(0).max(2000).nullable(),
  objectifPas: z.number().min(0).max(200000).nullable(),
  poidsDepart: z.number().min(0).max(1000).nullable(),
  reposDefautSec: z.number().int().min(0).max(900),
  unite: z.literal('kg'),
  timezone: z.string().min(1).max(60),
  // Paramètres coach supplémentaires (optionnels — absents des vieux payloads)
  nomAffiche: z.string().max(80).nullable().default(null),
  tailleCm: z.number().min(50).max(300).nullable().default(null),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  noteCoach: z.string().max(2000).nullable().default(null),
  joursSeance: z.array(z.number().int().min(0).max(6)).max(7).default([]),
});

const journalSchema = z.object({
  sommeil: z.number().min(0).max(24).nullish(),
  forme: z.number().min(0).max(10).nullish(),
  poids: z.number().min(0).max(1000).nullish(),
  calories: z.number().min(0).max(20000).nullish(),
  glucides: z.number().min(0).max(2000).nullish(),
  proteines: z.number().min(0).max(2000).nullish(),
  lipides: z.number().min(0).max(2000).nullish(),
  pas: z.number().min(0).max(200000).nullish(),
  entrainement: z.string().max(120).nullish(),
});

const journalAlimentSchema = z.object({
  alimentId: z.string().min(1).max(60),
  quantiteG: z.number().min(1).max(5000),
});

const champSchema = z.object({
  nom: z.string().min(1).max(80),
  unite: z.string().max(20).default(''),
});

const champValeurSchema = z.object({
  champId: z.string().min(1).max(60),
  valeur: z.string().max(120).nullable(),
});

const commentaireSchema = z.object({
  texte: z.string().min(1).max(2000),
});

const copieSchema = z.object({
  deUserId: z.string().min(1).max(60),
  progId: z.string().min(1).max(60),
  versUserId: z.string().min(1).max(60),
});

function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } }, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new AppError(400, ERR.VALIDATION, `Données invalides — ${r.error!.issues.map((i) => i.message).join('; ')}`);
  }
  return r.data!;
}

export function registerAdminRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  photoStore: PhotoStore,
  aliments: AlimentStore | null,
  champs: ChampStore | null,
  commentaires: CommentaireStore | null,
  dataDir: string,
) {
  /** Vérifie le rôle coach ; 403 sinon. */
  const coach = async (req: FastifyRequest) => {
    const user = ctx.users.byId(req.userId!);
    if (!user || user.role !== 'coach') {
      throw new AppError(403, ERR.FORBIDDEN_SHEET, 'Réservé au compte coach');
    }
    return user;
  };

  /** Agrégats de suivi d'un client pour le tableau de bord. */
  const dashboardFor = async (u: UserRecord): Promise<DashboardClient> => {
    const today = todayInTimezone('Europe/Paris');
    const base: DashboardClient = {
      id: u.id,
      email: u.email,
      disabled: !!u.disabled,
      createdAt: u.createdAt,
      dernierJournal: null,
      journalSemaine: 0,
      seancesSemaine: 0,
      seancesPrevues: 0,
      dernierSeance: null,
      poids: null,
      poidsDelta7: null,
      dernierePhoto: null,
      nbPhotos: 0,
      alertes: [],
    };
    try {
      const t = await ctx.forUser(u.id);
      const [settings, journal, seances, photos] = await Promise.all([
        t.settings.get().catch(() => null),
        t.journal.getRecent(45).catch(() => []),
        t.sessions.list(60).catch(() => []),
        photoStore.list(u.id).catch(() => []),
      ]);

      const joursDepuis = (date: string | null) =>
        date == null ? null : Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);

      // Journal — une ligne compte si au moins un champ de suivi est rempli.
      const saisies = journal.filter((e) => JOURNAL_FIELDS.some((k) => e[k] != null));
      base.dernierJournal = saisies[0]?.date ?? null;
      base.journalSemaine = saisies.filter((e) => e.date >= addDays(today, -6)).length;

      // Séances : semaine en cours (lundi → aujourd'hui)
      const jsDay = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0=dim..6=sam
      const depuisLundi = (jsDay + 6) % 7;
      const lundi = addDays(today, -depuisLundi);
      const terminees = seances.filter((s) => s.statut === 'terminee');
      const datesSeance = new Set(terminees.map((s) => s.date));
      base.seancesSemaine = terminees.filter((s) => s.date >= lundi).length;
      base.dernierSeance = terminees[0]?.date ?? null;

      // Séances planifiées passées cette semaine (joursSeance, même convention
      // que Date.getDay : 0 = dimanche)
      const joursPlan = settings?.joursSeance ?? [];
      const datesManquees: string[] = [];
      for (const d of joursPlan) {
        const offset = (d + 6) % 7; // distance depuis lundi
        if (offset > depuisLundi) continue; // pas encore passé cette semaine
        const jour = addDays(lundi, offset);
        if (!datesSeance.has(jour)) datesManquees.push(jour);
      }
      base.seancesPrevues = joursPlan.filter((d) => (d + 6) % 7 <= depuisLundi).length;

      // Poids : dernière pesée + delta vs pesée précédente (≥ 5 j d'écart)
      const pesees = journal.filter((e) => e.poids != null);
      base.poids = pesees[0]?.poids ?? null;
      const prev = pesees.find((e) => e.date <= addDays(pesees[0]?.date ?? today, -5));
      base.poidsDelta7 =
        base.poids != null && prev?.poids != null
          ? Math.round((base.poids - prev.poids) * 10) / 10
          : null;

      // Photos
      base.dernierePhoto = photos[0]?.date ?? null;
      base.nbPhotos = photos.length;

      // ---------- Alertes ----------
      if (u.disabled) return base;
      const compteJours = joursDepuis(u.createdAt.slice(0, 10)) ?? 0;
      const jSilence = joursDepuis(base.dernierJournal);
      if (base.dernierJournal == null) {
        if (compteJours >= 3) {
          base.alertes.push({ type: 'silence', message: 'Journal jamais rempli' });
        }
      } else if (jSilence! >= 3) {
        base.alertes.push({ type: 'silence', message: `Aucune saisie depuis ${jSilence} j` });
      }
      const dernierePesee = pesees[0]?.date ?? null;
      const jPesee = joursDepuis(dernierePesee);
      if ((dernierePesee != null && jPesee! >= 7) || (dernierePesee == null && settings?.poidsDepart != null && compteJours >= 7)) {
        base.alertes.push({
          type: 'pesee',
          message: dernierePesee == null ? 'Aucune pesée enregistrée' : `Pas de pesée depuis ${jPesee} j`,
        });
      }
      if (datesManquees.length) {
        base.alertes.push({
          type: 'seances',
          message: `${datesManquees.length} séance${datesManquees.length > 1 ? 's' : ''} manquée${datesManquees.length > 1 ? 's' : ''} cette semaine`,
        });
      }
      const jPhoto = joursDepuis(base.dernierePhoto);
      if (base.dernierePhoto == null) {
        if (compteJours >= 14) base.alertes.push({ type: 'photos', message: 'Aucune photo de suivi' });
      } else if (jPhoto! >= 28) {
        base.alertes.push({ type: 'photos', message: `Bilan photo à faire (${jPhoto} j)` });
      }
      return base;
    } catch {
      return base;
    }
  };

  const needCommentaires = () => {
    if (!commentaires) throw new AppError(400, ERR.VALIDATION, 'Commentaires indisponibles hors mode SQLite');
    return commentaires;
  };

  // ---------- Tableau de bord ----------

  app.get('/api/admin/dashboard', async (req) => {
    await coach(req);
    const clients = ctx.users.list().filter((x) => x.role === 'user');
    const out: DashboardClient[] = [];
    for (const c of clients) out.push(await dashboardFor(c));
    // Clients avec alertes d'abord, puis ordre alphabétique.
    return out.sort(
      (a, b) => b.alertes.length - a.alertes.length || a.email.localeCompare(b.email),
    );
  });

  // ---------- Sauvegardes SQLite ----------

  const backupsDir = path.join(dataDir, 'backups');

  app.get('/api/admin/sauvegardes', async (req) => {
    await coach(req);
    if (!ctx.db) throw new AppError(400, ERR.VALIDATION, 'Sauvegardes indisponibles hors mode SQLite');
    return listBackups(backupsDir);
  });

  app.post('/api/admin/sauvegardes', async (req) => {
    await coach(req);
    if (!ctx.db) throw new AppError(400, ERR.VALIDATION, 'Sauvegardes indisponibles hors mode SQLite');
    return backupDb(ctx.db, backupsDir);
  });

  /** Lit toute la bibliothèque 'Liste' (corps A2:C). */
  const listeRows = async (userId: string) => {
    const { provider } = await ctx.forUser(userId);
    const grid = await provider.getRange(SHEET_LISTE, 'A2:C2000');
    return { provider, rows: grid.map((r, i) => ({ r: i + 2, nom: r[0], muscle: r[1], video: r[2] })).filter((x) => x.nom != null && x.nom !== '') };
  };

  // ---------- Comptes ----------

  app.get('/api/admin/users', async (req) => {
    await coach(req);
    return ctx.users
      .list()
      .map(({ id, email, role, disabled, createdAt }) => ({ id, email, role, disabled: !!disabled, createdAt }));
  });

  app.post('/api/admin/users', async (req) => {
    await coach(req);
    const { email, password } = parse(createUserSchema, req.body);
    const user = ctx.users.create(email, password);
    await ctx.users.persist();
    return { id: user.id, email: user.email, role: user.role };
  });

  app.patch('/api/admin/users/:id', async (req) => {
    const me = await coach(req);
    const { id } = req.params as { id: string };
    if (id === me.id) throw new AppError(400, ERR.VALIDATION, 'Impossible de modifier son propre compte ici');
    const body = parse(patchUserSchema, req.body);
    if (body.password) await ctx.users.setPassword(id, body.password);
    if (body.disabled !== undefined || body.role !== undefined) {
      await ctx.users.update(id, { disabled: body.disabled, role: body.role });
    }
    const u = ctx.users.byId(id);
    return { id: u!.id, email: u!.email, role: u!.role, disabled: !!u!.disabled };
  });

  // ---------- Vue client (suivi) ----------

  app.get('/api/admin/users/:id/overview', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    const t = await ctx.forUser(id); // données DU client, pas du coach
    const [settings, journal, seances, programmes] = await Promise.all([
      t.settings.get().catch(() => null),
      t.journal.getRecent(30).catch(() => []),
      t.sessions.list().catch(() => []),
      t.programs.list().catch(() => []),
    ]);
    const photos = await photoStore.list(id).catch(() => []);
    return { settings, journal, seances: seances.slice(0, 20), programmes, photos };
  });

  // ---------- Édition des données du client (tout est modifiable) ----------

  /** Réglages/objectifs du client. */
  app.put('/api/admin/users/:id/settings', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    const t = await ctx.forUser(id);
    return t.settings.update(parse(settingsSchema, req.body));
  });

  /** Journal d'une date quelconque — création ou modification. */
  app.put('/api/admin/users/:id/journal/:date', async (req) => {
    await coach(req);
    const { id, date } = req.params as { id: string; date: string };
    const t = await ctx.forUser(id);
    return t.journal.upsertEntry(date, parse(journalSchema, req.body));
  });

  /** Historique journal complet du client (plage libre — export coach). */
  app.get('/api/admin/users/:id/journal', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    const q = req.query as { from?: string; to?: string };
    const t = await ctx.forUser(id);
    const from = q.from ?? '2000-01-01';
    const to = q.to ?? '2100-01-01';
    return t.journal.getRange(from, to);
  });

  /** Fil de commentaires d'une journée (le coach lit et répond). */
  app.get('/api/admin/users/:id/journal/:date/commentaires', async (req) => {
    await coach(req);
    const { id, date } = req.params as { id: string; date: string };
    return needCommentaires().list(id, date);
  });

  app.post('/api/admin/users/:id/journal/:date/commentaires', async (req) => {
    await coach(req);
    const { id, date } = req.params as { id: string; date: string };
    const { texte } = parse(commentaireSchema, req.body);
    return needCommentaires().add(id, date, 'coach', texte);
  });

  /** Le coach peut retirer n'importe quel message du fil. */
  app.delete('/api/admin/users/:id/commentaires/:cid', async (req) => {
    await coach(req);
    const { id, cid } = req.params as { id: string; cid: string };
    needCommentaires().remove(id, cid, null);
    return { ok: true };
  });

  /** Copie un programme d'un client vers un autre (modèle réutilisable). */
  app.post('/api/admin/programmes/copier', async (req) => {
    await coach(req);
    const { deUserId, progId, versUserId } = parse(copieSchema, req.body);
    const src = await ctx.forUser(deUserId);
    const dst = await ctx.forUser(versUserId);
    const prog = await src.programs.get(progId);
    return dst.programs.create({ nom: prog.nom, note: prog.note, exercices: prog.exercices });
  });

  /** Repas du client pour une date (plan alimentaire). */
  app.get('/api/admin/users/:id/journal/:date/aliments', async (req) => {
    await coach(req);
    const { id, date } = req.params as { id: string; date: string };
    return needAliments().listJournal(id, date);
  });

  app.post('/api/admin/users/:id/journal/:date/aliments', async (req) => {
    await coach(req);
    const { id, date } = req.params as { id: string; date: string };
    const { alimentId, quantiteG } = parse(journalAlimentSchema, req.body);
    return needAliments().addToJournal(id, date, alimentId, quantiteG);
  });

  app.patch('/api/admin/users/:id/journal/:date/aliments/:ligneId', async (req) => {
    await coach(req);
    const { id, ligneId } = req.params as { id: string; ligneId: string };
    const { quantiteG } = parse(z.object({ quantiteG: z.number().min(1).max(5000) }), req.body);
    return needAliments().updateJournalQty(id, ligneId, quantiteG);
  });

  app.delete('/api/admin/users/:id/journal/:date/aliments/:ligneId', async (req) => {
    await coach(req);
    const { id, ligneId } = req.params as { id: string; ligneId: string };
    needAliments().removeFromJournal(id, ligneId);
    return { ok: true };
  });

  /** Détail d'une séance + suppression. */
  app.get('/api/admin/users/:id/seances/:seanceId', async (req) => {
    await coach(req);
    const { id, seanceId } = req.params as { id: string; seanceId: string };
    const t = await ctx.forUser(id);
    return t.sessions.get(seanceId);
  });

  app.delete('/api/admin/users/:id/seances/:seanceId', async (req) => {
    await coach(req);
    const { id, seanceId } = req.params as { id: string; seanceId: string };
    const t = await ctx.forUser(id);
    await t.sessions.delete(seanceId);
    return { ok: true };
  });

  /** Suppression d'une photo du client. */
  app.delete('/api/admin/users/:id/photos/:photoId', async (req) => {
    await coach(req);
    const { id, photoId } = req.params as { id: string; photoId: string };
    await photoStore.remove(id, photoId);
    return { ok: true };
  });

  app.get('/api/admin/users/:id/photos/:photoId/file', async (req, reply) => {
    await coach(req);
    const { id, photoId } = req.params as { id: string; photoId: string };
    const { filePath, ext } = await photoStore.file(id, photoId);
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return reply.type(mime).header('Cache-Control', 'private, max-age=3600').send(createReadStream(filePath));
  });

  // ---------- Bibliothèque d'exercices (globale en mode sqlite) ----------

  app.get('/api/admin/exercices', async (req) => {
    const me = await coach(req);
    const { rows } = await listeRows(me.id);
    return rows.map((r) => ({ nom: r.nom, muscle: r.muscle, videoUrl: r.video ?? '' }));
  });

  app.post('/api/admin/exercices', async (req) => {
    const me = await coach(req);
    const input = parse(exerciseSchema, req.body);
    const { provider, rows } = await listeRows(me.id);
    if (rows.some((r) => String(r.nom).toLowerCase() === input.nom.toLowerCase())) {
      throw new AppError(409, ERR.VALIDATION, 'Un exercice porte déjà ce nom');
    }
    const next = Math.max(1, ...rows.map((r) => r.r)) + 1;
    await provider.writeProvision!(SHEET_LISTE, `A${next}:C${next}`, [[input.nom, input.muscle, input.videoUrl]]);
    return input;
  });

  app.put('/api/admin/exercices/:nom', async (req) => {
    const me = await coach(req);
    const { nom } = req.params as { nom: string };
    const input = parse(exerciseSchema, req.body);
    const { provider, rows } = await listeRows(me.id);
    const row = rows.find((r) => r.nom === decodeURIComponent(nom));
    if (!row) throw new AppError(404, ERR.NOT_FOUND, 'Exercice introuvable');
    await provider.writeProvision!(SHEET_LISTE, `A${row.r}:C${row.r}`, [[input.nom, input.muscle, input.videoUrl]]);
    return input;
  });

  app.delete('/api/admin/exercices/:nom', async (req) => {
    const me = await coach(req);
    const { nom } = req.params as { nom: string };
    const { provider, rows } = await listeRows(me.id);
    const target = decodeURIComponent(nom);
    const kept = rows.filter((r) => r.nom !== target);
    if (kept.length === rows.length) throw new AppError(404, ERR.NOT_FOUND, 'Exercice introuvable');
    // Réécrit tout le corps : la ligne supprimée disparaît par décalage,
    // la dernière ligne de l'ancien corps est blanchie.
    const body: CellValue[][] = kept.map((r) => [r.nom ?? null, r.muscle ?? null, r.video ?? null]);
    await provider.writeProvision!(SHEET_LISTE, `A2:C${rows.length + 1}`, [...body, [null, null, null]]);
    return { ok: true };
  });

  // ---------- Programmes des clients ----------

  app.get('/api/admin/users/:id/programmes', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    const t = await ctx.forUser(id);
    return t.programs.list();
  });

  app.post('/api/admin/users/:id/programmes', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    const t = await ctx.forUser(id);
    const body = parse(programSchemaAdmin, req.body);
    if (!body.nom || !body.exercices) {
      throw new AppError(400, ERR.VALIDATION, 'nom et exercices requis');
    }
    return t.programs.create({ nom: body.nom, exercices: body.exercices as never });
  });

  app.put('/api/admin/users/:id/programmes/:progId', async (req) => {
    await coach(req);
    const { id, progId } = req.params as { id: string; progId: string };
    const t = await ctx.forUser(id);
    const body = parse(programSchemaAdmin, req.body);
    return t.programs.update(progId, {
      nom: body.nom,
      note: body.note,
      statut: body.statut,
      exercices: body.exercices as never,
    });
  });

  /** Archive un programme (soft delete — l'historique reste lisible). */
  app.delete('/api/admin/users/:id/programmes/:progId', async (req) => {
    await coach(req);
    const { id, progId } = req.params as { id: string; progId: string };
    const t = await ctx.forUser(id);
    return t.programs.archive(progId);
  });

  // ---------- Bibliothèque d'aliments (sqlite requis) ----------

  const needAliments = () => {
    if (!aliments) throw new AppError(400, ERR.VALIDATION, 'Aliments indisponibles hors mode SQLite');
    return aliments;
  };

  app.get('/api/admin/aliments', async (req) => {
    await coach(req);
    return needAliments().list();
  });

  app.post('/api/admin/aliments', async (req) => {
    await coach(req);
    return needAliments().create(parse(alimentSchema, req.body));
  });

  app.put('/api/admin/aliments/:id', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    return needAliments().update(id, parse(alimentSchema, req.body));
  });

  app.delete('/api/admin/aliments/:id', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    needAliments().remove(id);
    return { ok: true };
  });

  /** Import CSV en masse — une ligne par aliment :
   *  `nom ; kcal ; proteines ; glucides ; lipides` (pour 100 g).
   *  Compatible avec un export CIQUAL/ANSES reformaté. */
  app.post('/api/admin/aliments/import', async (req) => {
    await coach(req);
    const { csv } = parse(z.object({ csv: z.string().min(1).max(2_000_000) }), req.body);
    return needAliments().importCsv(csv);
  });

  // ---------- Champs de suivi personnalisés (par client, sqlite requis) ----------

  const needChamps = () => {
    if (!champs) throw new AppError(400, ERR.VALIDATION, 'Champs personnalisés indisponibles hors mode SQLite');
    return champs;
  };

  app.get('/api/admin/users/:id/champs', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    return needChamps().list(id);
  });

  app.post('/api/admin/users/:id/champs', async (req) => {
    await coach(req);
    const { id } = req.params as { id: string };
    return needChamps().create(id, parse(champSchema, req.body));
  });

  app.put('/api/admin/users/:id/champs/:champId', async (req) => {
    await coach(req);
    const { id, champId } = req.params as { id: string; champId: string };
    return needChamps().update(id, champId, parse(champSchema, req.body));
  });

  app.delete('/api/admin/users/:id/champs/:champId', async (req) => {
    await coach(req);
    const { id, champId } = req.params as { id: string; champId: string };
    needChamps().remove(id, champId);
    return { ok: true };
  });

  /** Valeurs des champs personnalisés pour une date (lecture + écriture). */
  app.get('/api/admin/users/:id/journal/:date/custom', async (req) => {
    await coach(req);
    const { id, date } = req.params as { id: string; date: string };
    return needChamps().getValues(id, date);
  });

  app.put('/api/admin/users/:id/journal/:date/custom', async (req) => {
    await coach(req);
    const { id, date } = req.params as { id: string; date: string };
    const { champId, valeur } = parse(champValeurSchema, req.body);
    needChamps().setValue(id, date, champId, valeur);
    return needChamps().getValues(id, date);
  });
}
