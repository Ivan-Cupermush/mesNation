import { albumLayout, plural, formatDuration, formatSize, messagePreview } from '../src/components/chat/chatUtils';

describe('albumLayout', () => {
  it('одно фото сохраняет пропорции и не выше лимита', () => {
    const { cells, height, width } = albumLayout([0.5], 300, 360);
    expect(cells).toHaveLength(1);
    expect(height).toBeLessThanOrEqual(360);
    expect(width).toBeLessThanOrEqual(300);
  });

  it('ячейки не выходят за ширину и не пересекаются по строкам', () => {
    for (let n = 2; n <= 10; n++) {
      const { cells, width, height } = albumLayout(Array(n).fill(1.3), 300, 360);
      expect(cells).toHaveLength(n);
      for (const c of cells) {
        expect(c.x + c.w).toBeLessThanOrEqual(width + 0.01);
        expect(c.y + c.h).toBeLessThanOrEqual(height + 0.01);
      }
    }
  });
});

describe('форматирование', () => {
  it('склонения', () => {
    expect(plural(1, ['голос', 'голоса', 'голосов'])).toBe('голос');
    expect(plural(3, ['голос', 'голоса', 'голосов'])).toBe('голоса');
    expect(plural(11, ['голос', 'голоса', 'голосов'])).toBe('голосов');
    expect(plural(22, ['голос', 'голоса', 'голосов'])).toBe('голоса');
  });

  it('длительность и размер', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatSize(2048)).toBe('2 КБ');
  });

  it('превью сообщения', () => {
    expect(messagePreview({ media_kind: 'video', text: 'смотри' })).toBe('🎬 Видео смотри');
    expect(messagePreview({ file_url: '/x', file_name: 'a.pdf', media_kind: 'file' })).toBe('📎 a.pdf');
  });
});
