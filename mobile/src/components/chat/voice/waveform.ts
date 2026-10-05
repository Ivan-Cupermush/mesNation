/**
 * Волна голосового: на телефоне при записи снимаем громкость, храним до
 * 100 уровней 0..31 (как Telegram — 5 бит на столбик).
 */

export const WAVE_MAX = 31;
export const WAVE_SAMPLES = 100;

/** Громкость микрофона в дБ (-160..0) → 0..1 для столбика. */
export function dbToLevel(db?: number | null): number {
  if (db === undefined || db === null || !Number.isFinite(db)) return 0;
  // Речь обычно -45..-5 дБ; тишину прижимаем к нулю.
  const v = (db + 50) / 45;
  return Math.max(0, Math.min(1, v));
}

/** Пересэмплирование: максимум в каждом отрезке, чтобы пики не терялись. */
export function resample(levels: number[], count: number): number[] {
  if (count <= 0) return [];
  if (!levels.length) return new Array(count).fill(0);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor((i * levels.length) / count);
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / count));
    let mx = 0;
    for (let j = a; j < b && j < levels.length; j++) mx = Math.max(mx, levels[j]);
    out.push(mx);
  }
  return out;
}

/** Уровни 0..1 → строка для сервера «0,5,31,…». */
export function encodeWaveform(levels: number[]): string {
  const peak = Math.max(0.05, ...levels);
  return resample(levels, Math.min(WAVE_SAMPLES, Math.max(1, levels.length)))
    .map((v) => Math.round((v / peak) * WAVE_MAX))
    .join(',');
}

/** Строка с сервера → уровни 0..1. Без волны — ровная «спокойная» волна по id. */
export function decodeWaveform(raw: string | null | undefined, seed: number | string = 1): number[] {
  if (raw) {
    const vals = raw
      .split(',')
      .map((x) => Number(x) / WAVE_MAX)
      .filter((x) => Number.isFinite(x));
    if (vals.length) return vals;
  }
  let h = String(seed)
    .split('')
    .reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: 48 }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.15 + ((h >>> 16) % 100) / 400;
  });
}

/** 0:05,3 — таймер записи как в Telegram. */
export function recordTimer(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const d = Math.floor((total % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')},${d}`;
}
