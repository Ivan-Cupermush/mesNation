/**
 * Гибкий поиск: без учёта регистра, ё=е, кириллица ↔ латиница (транслит),
 * неправильная раскладка (ghbdtn → привет) и опечатки (расстояние Левенштейна).
 *
 * rank — чем меньше, тем лучше совпадение:
 *   0 — начало строки или слова, 1 — подстрока, 2 — транслит/раскладка,
 *   3 — опечатка.
 */

const RU_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const EN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU_LAYOUT = 'йцукенгшщзхъфывапролджэячсмитьбюё';

const normalize = (s: string) => (s || '').toLowerCase().replace(/ё/g, 'е').trim();

/** Транслитерация кириллицы в латиницу (латиница остаётся как есть). */
export function translit(s: string): string {
  return normalize(s)
    .split('')
    .map((ch) => (ch in RU_TO_LAT ? RU_TO_LAT[ch] : ch))
    .join('');
}

/** Исправляет текст, набранный не в той раскладке (в обе стороны). */
export function switchLayout(s: string): string {
  return normalize(s)
    .split('')
    .map((ch) => {
      const en = EN_LAYOUT.indexOf(ch);
      if (en >= 0) return RU_LAYOUT[en];
      const ru = RU_LAYOUT.indexOf(ch);
      return ru >= 0 ? EN_LAYOUT[ru] : ch;
    })
    .join('');
}

/** Расстояние Левенштейна с ранним выходом, когда оно заведомо больше max. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Допустимое число опечаток в зависимости от длины запроса. */
const allowedTypos = (len: number) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

function directRank(text: string, q: string): number {
  const idx = text.indexOf(q);
  if (idx === -1) return -1;
  return idx === 0 || /[\s\-_.@]/.test(text[idx - 1]) ? 0 : 1;
}

/**
 * Несколько слов — как в Telegram: каждое должно найтись (в любом порядке),
 * «иван петров» найдёт «Петров Иван».
 */
export function fuzzyMatch(text: string, query: string): { match: boolean; rank: number } {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length <= 1) return matchOne(text, query);
  let rank = 0;
  for (const w of words) {
    const r = matchOne(text, w);
    if (!r.match) return { match: false, rank: -1 };
    rank = Math.max(rank, r.rank);
  }
  return { match: true, rank };
}

function matchOne(text: string, query: string): { match: boolean; rank: number } {
  const t = normalize(text);
  const q = normalize(query);
  if (!q) return { match: true, rank: 0 };
  if (!t) return { match: false, rank: -1 };

  const direct = directRank(t, q);
  if (direct >= 0) return { match: true, rank: direct };

  // Транслит в обе стороны («ivan» найдёт «Иван», «иван» — «ivan»).
  if (translit(t).includes(translit(q))) return { match: true, rank: 2 };
  // Неправильная раскладка («bdfy» → «иван»).
  const switched = switchLayout(q);
  if (t.includes(switched) || translit(t).includes(translit(switched))) return { match: true, rank: 2 };

  // Опечатки: сравниваем запрос с каждым словом и с началом слов той же длины.
  const max = allowedTypos(q.length);
  if (max > 0) {
    const words = t.split(/[\s\-_.@]+/).filter(Boolean);
    const qt = translit(q);
    for (const w of words) {
      const candidates = [w, w.slice(0, q.length)];
      for (const cand of candidates) {
        if (levenshtein(cand, q, max) <= max || levenshtein(translit(cand), qt, max) <= max) {
          return { match: true, rank: 3 };
        }
      }
    }
  }
  return { match: false, rank: -1 };
}

// ---------- Подсветка найденного ----------

/** Слова запроса и их варианты в другой раскладке — что подсвечивать. */
export function highlightTerms(query: string): string[] {
  const words = normalize(query).split(/[\s,.;:!?()«»"]+/).filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    out.add(w);
    const sw = switchLayout(w);
    if (sw !== w) out.add(sw);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** Участки текста [начало, конец), совпавшие с запросом (без учёта регистра, ё = е). */
export function matchRanges(text: string, query: string): [number, number][] {
  if (!text || !query.trim()) return [];
  const t = (text || '').toLowerCase().replace(/ё/g, 'е');
  const ranges: [number, number][] = [];
  for (const term of highlightTerms(query)) {
    let from = 0;
    for (;;) {
      const i = t.indexOf(term, from);
      if (i < 0) break;
      ranges.push([i, i + term.length]);
      from = i + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Кусок длинного текста вокруг первого совпадения — для списка результатов. */
export function snippetAround(text: string, query: string, radius = 48): string {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  const first = matchRanges(flat, query)[0];
  if (!first || flat.length <= radius * 2) return flat;
  const start = Math.max(0, first[0] - radius);
  const end = Math.min(flat.length, first[1] + radius * 2);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}
