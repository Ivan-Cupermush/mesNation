import { deleteLastSymbol, searchEmoji, EMOJI_CATEGORIES } from '../src/components/chat/emojiData';

describe('панель смайликов', () => {
  it('удаляет составной эмодзи целиком', () => {
    expect(deleteLastSymbol('привет 👍🏽')).toBe('привет ');
    expect(deleteLastSymbol('флаг 🇷🇺')).toBe('флаг ');
    expect(deleteLastSymbol('a🧑‍💻')).toBe('a');
    expect(deleteLastSymbol('сердце ❤️')).toBe('сердце ');
    expect(deleteLastSymbol('abc')).toBe('ab');
    expect(deleteLastSymbol('')).toBe('');
  });
  it('ищет по русским словам и разделам', () => {
    expect(searchEmoji('сердц')).toContain('❤️');
    expect(searchEmoji('Спасибо')).toContain('🙏');
    expect(searchEmoji('живот').length).toBeGreaterThan(10);
    expect(searchEmoji('')).toEqual([]);
  });
  it('в разделах нет повторов', () => {
    for (const c of EMOJI_CATEGORIES) expect(new Set(c.emojis).size).toBe(c.emojis.length);
  });
});
