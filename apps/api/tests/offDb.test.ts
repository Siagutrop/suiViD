import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, type Db } from '../src/db.js';
import { OffDbStore } from '../src/offDb.js';

describe('OffDbStore — copie locale Open Food Facts', () => {
  let db: Db;
  let store: OffDbStore;

  beforeEach(() => {
    db = openDb(':memory:');
    store = new OffDbStore(db);
    store.replaceAll([
      { code: '3017620422003', nom: 'Nutella', marque: 'Ferrero', kcal: 539, proteines: 6.3, glucides: 57.5, lipides: 30.9, scans: 50000 },
      { code: '3560070472786', nom: 'Coquillettes', marque: 'U', kcal: 360, proteines: 12.5, glucides: 71, lipides: 1.5, scans: 400 },
      { code: '3560071234567', nom: 'Yaourt nature', marque: 'U', kcal: 61, proteines: 4.5, glucides: 5, lipides: 3, scans: 900 },
      { code: '3276190001234', nom: 'Riz basmati', marque: null, kcal: 350, proteines: 8, glucides: 77, lipides: 0.6, scans: 300 },
      { code: '3560009999999', nom: 'Nutella biscuits', marque: 'Ferrero', kcal: 480, proteines: 7, glucides: 60, lipides: 22, scans: 800 },
    ]);
  });

  it('recherche FTS5 par nom', () => {
    const r = store.search('coquillettes');
    expect(r).toHaveLength(1);
    expect(r[0]!.nom).toBe('Coquillettes');
    expect(r[0]!.codeBarre).toBe('3560070472786');
  });

  it('recherche marque — « yaourt u » remonte le produit U', () => {
    const r = store.search('yaourt u');
    expect(r[0]?.nom).toBe('Yaourt nature');
    expect(r[0]?.marque).toBe('U');
  });

  it('classement par nombre de scans', () => {
    const r = store.search('nutella');
    expect(r).toHaveLength(2);
    expect(r[0]!.nom).toBe('Nutella'); // 50 000 scans > 800
  });

  it('lookup par code-barres', () => {
    const p = store.barcode('3017620422003');
    expect(p?.nom).toBe('Nutella');
    expect(store.barcode('9999999999999')).toBeNull();
  });

  it('meta : date de synchro + compteur', () => {
    const { lastSync, count } = store.meta();
    expect(lastSync).toBeTruthy();
    expect(count).toBe(5);
  });

  it('import staging : commit atomique, remplace le catalogue', () => {
    store.beginImport();
    store.insertChunk([{ code: '111', nom: 'Nouveau produit', marque: null, kcal: 100, proteines: 1, glucides: 20, lipides: 2, scans: 5 }]);
    // Avant commit, l'ancien catalogue répond encore
    expect(store.count()).toBe(5);
    store.commitImport(1);
    expect(store.count()).toBe(1);
    expect(store.search('nutella')).toHaveLength(0);
    expect(store.barcode('111')?.nom).toBe('Nouveau produit');
  });

  it('requête vide ou ponctuation ne casse pas FTS', () => {
    expect(store.search('')).toHaveLength(0);
    expect(store.search('   ')).toHaveLength(0);
    expect(store.search('!!!')).toHaveLength(0);
    expect(store.search("l'oignon")).not.toThrow;
  });
});
