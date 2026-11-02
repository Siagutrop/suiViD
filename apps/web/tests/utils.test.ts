import { describe, it, expect } from 'vitest';
import {
  youtubeId,
  youtubeEmbed,
  formatDateFr,
  formatShort,
  formatKg,
  formatNum,
  formatDuration,
  formatClock,
  greeting,
} from '../src/lib/utils';

describe('youtubeId', () => {
  it('extrait l’ID depuis les formats YouTube du classeur', () => {
    expect(youtubeId('https://www.youtube.com/shorts/abc123DEF45')).toBe('abc123DEF45');
    expect(youtubeId('https://www.youtube.com/watch?v=xyz987UVW')).toBe('xyz987UVW');
    expect(youtubeId('https://youtu.be/qwerty123')).toBe('qwerty123');
  });

  it('renvoie null pour les valeurs absentes ou invalides', () => {
    expect(youtubeId(null)).toBeNull();
    expect(youtubeId(undefined)).toBeNull();
    expect(youtubeId('https://example.com')).toBeNull();
  });

  it('youtubeEmbed produit une URL nocookie', () => {
    expect(youtubeEmbed('https://youtu.be/qwerty123')).toBe(
      'https://www.youtube-nocookie.com/embed/qwerty123',
    );
    expect(youtubeEmbed(null)).toBeNull();
  });
});

describe('formatage français', () => {
  it('formatDateFr produit le jour et le mois en français', () => {
    expect(formatDateFr('2026-11-02')).toBe('lundi 2 novembre');
    expect(formatDateFr('2026-01-01')).toBe('jeudi 1 janvier');
  });

  it('formatShort produit JJ/MM', () => {
    expect(formatShort('2026-11-02')).toBe('02/11');
  });

  it('formatKg utilise la virgule décimale et le tiret pour absent', () => {
    expect(formatKg(78.45)).toBe('78,5 kg');
    expect(formatKg(null)).toBe('—');
  });

  it('formatNum affiche les entiers sans décimale', () => {
    expect(formatNum(9500)).toBe('9500');
    expect(formatNum(7.36)).toBe('7,4');
    expect(formatNum(2100, 'kcal')).toBe('2100 kcal');
  });

  it('formatDuration et formatClock', () => {
    expect(formatDuration(4200)).toBe('1 h 10');
    expect(formatDuration(300)).toBe('5 min');
    expect(formatClock(95)).toBe('01:35');
  });

  it('greeting suit les tranches horaires françaises', () => {
    expect(greeting(3)).toBe('Bonne nuit');
    expect(greeting(9)).toBe('Bonjour');
    expect(greeting(15)).toBe('Bon après-midi');
    expect(greeting(20)).toBe('Bonsoir');
  });
});
