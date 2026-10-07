import { dbToLevel, decodeWaveform, encodeWaveform, recordTimer, resample } from '../src/components/chat/voice/waveformData';
import { isUnlistened } from '../src/components/chat/chatUtils';

describe('волна голосового', () => {
  it('громкость в дБ → 0..1', () => {
    expect(dbToLevel(-160)).toBe(0);
    expect(dbToLevel(0)).toBe(1);
    expect(dbToLevel(undefined)).toBe(0);
  });

  it('кодируется до 100 уровней 0..31 и раскодируется обратно', () => {
    const levels = Array.from({ length: 250 }, (_, i) => (i % 10) / 10);
    const raw = encodeWaveform(levels);
    const parts = raw.split(',').map(Number);
    expect(parts).toHaveLength(100);
    expect(Math.max(...parts)).toBe(31);
    expect(parts.every((v) => v >= 0 && v <= 31)).toBe(true);
    expect(decodeWaveform(raw)).toHaveLength(100);
  });

  it('пересэмплирование сохраняет пики', () => {
    expect(resample([0, 1, 0, 0], 2)).toEqual([1, 0]);
  });

  it('без волны — стабильная заглушка', () => {
    expect(decodeWaveform(null, 42)).toEqual(decodeWaveform(null, 42));
  });

  it('таймер записи как в Telegram', () => {
    expect(recordTimer(5300)).toBe('0:05,3');
    expect(recordTimer(65_000)).toBe('1:05,0');
  });

  it('точка «не прослушано»', () => {
    const voice = { id: 1, media_kind: 'voice', sender_id: 1, listened_by: [] as number[] };
    expect(isUnlistened(voice, 1)).toBe(true); // своё: пока никто не послушал
    expect(isUnlistened(voice, 2)).toBe(true);
    voice.listened_by = [2];
    expect(isUnlistened(voice, 1)).toBe(false);
    expect(isUnlistened(voice, 2)).toBe(false);
    expect(isUnlistened({ id: 2, media_kind: 'photo' }, 2)).toBe(false);
  });
});
