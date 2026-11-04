import { z } from 'zod';

// ------------------------------------------------------------------
// Schémas Zod — validation des entrées d'API (backend) et des
// formulaires (frontend). Une seule source de vérité.
// ------------------------------------------------------------------

const nullToNull = <T extends z.ZodTypeAny>(schema: T) => schema.nullable();

export const journalValuesSchema = z.object({
  sommeil: nullToNull(z.number().min(0).max(24)),
  forme: nullToNull(z.number().min(1).max(10)), // le sheet peut contenir des décimales
  poids: nullToNull(z.number().min(20).max(400)),
  calories: nullToNull(z.number().min(0).max(20000)),
  glucides: nullToNull(z.number().min(0).max(2000)),
  proteines: nullToNull(z.number().min(0).max(1000)),
  lipides: nullToNull(z.number().min(0).max(1000)),
  pas: nullToNull(z.number().int().min(0).max(200000)),
  entrainement: nullToNull(z.string().max(200)),
});

export type JournalValuesInput = z.infer<typeof journalValuesSchema>;

/**
 * Corps de la requête PUT /journal/today.
 * - values : valeurs à écrire (les clés absentes ne sont pas envoyées —
 *   le frontend envoie toujours l'objet complet).
 * - base   : valeurs lues au chargement du formulaire, pour la détection
 *   de conflit. Cellules divergentes => 409, sauf si force=true.
 * - force  : l'utilisateur a confirmé l'écrasement des valeurs actuelles.
 */
export const updateJournalSchema = z.object({
  values: journalValuesSchema.partial(),
  base: journalValuesSchema.partial().optional(),
  force: z.boolean().optional(),
});

export const programExerciseSchema = z.object({
  exercice: z.string().min(1).max(200),
  series: z.number().int().min(1).max(20),
  repsCible: z.string().max(50).nullable().optional(),
  variante: z.string().max(500).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  reposSec: z.number().int().min(0).max(3600).nullable().optional(),
});

export const programSchema = z.object({
  nom: z.string().min(1).max(100),
  statut: z.enum(['actif', 'archive']).optional(),
  note: z.string().max(500).nullable().optional(),
  exercices: z.array(programExerciseSchema).max(50),
});

export const sessionSetSchema = z.object({
  serie: z.number().int().min(1).max(30),
  chargeKg: z.number().min(0).max(1000).nullable(),
  repetitions: z.number().int().min(0).max(500).nullable(),
  terminee: z.boolean(),
  notes: z.string().max(500).nullable().optional(),
});

export const sessionExerciseSchema = z.object({
  exercice: z.string().min(1).max(200),
  ordre: z.number().int().min(0),
  passee: z.boolean(),
  sets: z.array(sessionSetSchema).max(30),
});

export const finishSessionSchema = z.object({
  programmeId: z.string().max(100).nullable().optional(),
  programmeNom: z.string().min(1).max(100),
  debut: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  fin: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  statut: z.enum(['terminee', 'abandonnee']).default('terminee'),
  notes: z.string().max(1000).nullable().optional(),
  exercices: z.array(sessionExerciseSchema).min(1).max(50),
});

export const userSettingsSchema = z.object({
  objectifPoids: z.number().min(20).max(400).nullable(),
  objectifCalories: z.number().min(0).max(20000).nullable(),
  objectifProteines: z.number().min(0).max(1000).nullable(),
  objectifGlucides: z.number().min(0).max(2000).nullable(),
  objectifLipides: z.number().min(0).max(1000).nullable(),
  objectifPas: z.number().int().min(0).max(200000).nullable(),
  poidsDepart: z.number().min(20).max(400).nullable(),
  reposDefautSec: z.number().int().min(0).max(3600),
  unite: z.literal('kg'),
  timezone: z.string().max(100),
  // Champs également éditables côté coach — acceptés ici pour ne pas
  // les effacer quand le client enregistre ses propres objectifs.
  nomAffiche: z.string().max(80).nullable(),
  tailleCm: z.number().min(50).max(300).nullable(),
  dateNaissance: z.string().max(20).nullable(),
  noteCoach: z.string().max(2000).nullable(),
  joursSeance: z.array(z.number().int().min(0).max(6)).max(7),
});

export const emailSchema = z.string().trim().toLowerCase().email().max(200);

export const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, '6 caractères minimum').max(200),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

/** Lien ou identifiant brut d'un Google Sheets. */
export const linkSheetSchema = z.object({
  url: z.string().trim().min(5).max(500),
});

export const provisionSchema = z.object({
  confirm: z.literal(true),
});
