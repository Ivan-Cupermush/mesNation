/**
 * Поиск как в Telegram: запрос делится на слова, каждое слово ищется как
 * часть слова (в любом порядке), без учёта регистра, «ё» = «е»; слово,
 * набранное не в той раскладке («ghbdtn»), тоже находит «привет».
 */

const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU_LAYOUT = 'йцукенгшщзхъфывапролджэячсмитьбюё';

/** Нормализация в JS — та же, что searchNorm() в SQL. */
export const normText = (s: string) => (s || '').toLowerCase().replace(/ё/g, 'е');

export function switchLayout(s: string): string {
  return s
    .split('')
    .map((ch) => {
      const en = EN_LAYOUT.indexOf(ch);
      if (en >= 0) return RU_LAYOUT[en];
      const ru = RU_LAYOUT.indexOf(ch);
      return ru >= 0 ? EN_LAYOUT[ru] : ch;
    })
    .join('')
    .replace(/ё/g, 'е');
}

/**
 * Регистр и «ё» в SQL — явной заменой: lower() для кириллицы зависит от
 * локали базы, а translate() работает везде одинаково.
 */
export const searchNorm = (expr: string) =>
  `translate(lower(COALESCE(${expr}, '')), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯё', 'абвгдеежзийклмнопрстуфхцчшщъыьэюяе')`;

/** Слова запроса и их варианты (как набрано и в другой раскладке). */
export function searchTokens(q: string): string[][] {
  const words = normText(q)
    .split(/[\s,.;:!?()«»"“”„]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 8);
  return words.map((w) => {
    const alts = new Set([w]);
    const switched = switchLayout(w);
    // Раскладку переключаем, только если слово целиком «не в той» раскладке.
    if (switched !== w && /^[a-z[\];',.`]+$/.test(w)) alts.add(switched);
    else if (switched !== w && /^[а-яе]+$/.test(w)) alts.add(switched);
    return [...alts];
  });
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Условие «каждое слово запроса есть хотя бы в одном из полей».
 * Шаблоны добавляются в params, возвращается SQL-фрагмент.
 */
export function tokensWhere(fields: string[], tokens: string[][], params: unknown[]): string {
  const normalized = fields.map(searchNorm);
  return tokens
    .map((alts) => {
      params.push(alts.map((a) => `%${escapeLike(a)}%`));
      const p = `$${params.length}::text[]`;
      return `(${normalized.map((f) => `${f} LIKE ANY(${p})`).join(' OR ')})`;
    })
    .join(' AND ');
}
