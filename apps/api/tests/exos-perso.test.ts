import { describe, expect, it } from 'vitest';
import { SHEET_EXOS_PERSO } from '@suivi/shared';
import { AppError } from '../src/errors.js';
import { buildMockGrid } from '../src/mock/seed.js';
import { MockProvider } from '../src/providers/MockProvider.js';
import { ExerciseRepository } from '../src/repositories/ExerciseRepository.js';

function make() {
  const provider = new MockProvider(buildMockGrid('2026-11-02'));
  return { provider, repo: new ExerciseRepository(provider) };
}

describe('Exercices perso (onglet ExosPerso)', () => {
  it('list() sans ExosPerso : uniquement la bibliothèque globale', async () => {
    const { repo } = make();
    const exos = await repo.list();
    expect(exos.length).toBeGreaterThan(50);
    expect(exos.every((e) => !e.perso)).toBe(true);
  });

  it('createPerso crée l\'onglet à la volée et l\'exo apparaît dans list()', async () => {
    const { provider, repo } = make();
    const created = await repo.createPerso({
      nom: 'Mon exo maison',
      muscle: 'Pectoraux',
      tag: 'élastique',
      videoUrl: null,
    });
    expect(created.perso).toBe(true);
    expect(created.tag).toBe('élastique');
    expect(await provider.listSheets()).toContain(SHEET_EXOS_PERSO);
    const head = await provider.getRange(SHEET_EXOS_PERSO, 'A1:D1');
    expect(head[0]).toEqual(['Nom', 'Muscle', 'Tag', 'Lien vidéo']);

    const exos = await repo.list();
    const e = exos.find((x) => x.nom === 'Mon exo maison');
    expect(e).toMatchObject({ perso: true, muscle: 'Pectoraux', tag: 'élastique' });
  });

  it('createPerso refuse un doublon (global ou perso, insensible à la casse)', async () => {
    const { repo } = make();
    // Nom existant dans la Liste globale
    await expect(
      repo.createPerso({ nom: 'crunch poulie haute', muscle: 'Abdos', tag: null, videoUrl: null }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await repo.createPerso({ nom: 'Exo A', muscle: 'Dos', tag: null, videoUrl: null });
    await expect(
      repo.createPerso({ nom: 'exo a', muscle: 'Dos', tag: null, videoUrl: null }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updatePerso modifie muscle/tag et permet le renommage', async () => {
    const { repo } = make();
    await repo.createPerso({ nom: 'Exo B', muscle: 'Dos', tag: null, videoUrl: null });
    const updated = await repo.updatePerso('Exo B', {
      nom: 'Exo B2',
      muscle: 'Trices', // normalisé -> Triceps
      tag: 'maison',
      videoUrl: 'https://youtu.be/x',
    });
    expect(updated).toMatchObject({ nom: 'Exo B2', muscle: 'Triceps', tag: 'maison', perso: true });
    const exos = await repo.list();
    expect(exos.find((e) => e.nom === 'Exo B')).toBeUndefined();
    expect(exos.find((e) => e.nom === 'Exo B2')).toBeDefined();
  });

  it('updatePerso refuse un renommage vers un nom existant', async () => {
    const { repo } = make();
    await repo.createPerso({ nom: 'Exo C', muscle: 'Dos', tag: null, videoUrl: null });
    await expect(
      repo.updatePerso('Exo C', { nom: 'Crunch poulie haute', muscle: 'Dos', tag: null, videoUrl: null }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updatePerso/removePerso sur un exo global ou inconnu -> 404', async () => {
    const { repo } = make();
    await expect(
      repo.updatePerso('Crunch poulie haute', { nom: 'X', muscle: 'Dos', tag: null, videoUrl: null }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(repo.removePerso('Inexistant')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('removePerso supprime l\'exo de la liste', async () => {
    const { repo } = make();
    await repo.createPerso({ nom: 'Exo D', muscle: 'Dos', tag: null, videoUrl: null });
    await repo.createPerso({ nom: 'Exo E', muscle: 'Dos', tag: 'garde', videoUrl: null });
    await repo.removePerso('Exo D');
    const exos = await repo.list();
    expect(exos.find((e) => e.nom === 'Exo D')).toBeUndefined();
    expect(exos.find((e) => e.nom === 'Exo E')?.tag).toBe('garde');
  });
});
