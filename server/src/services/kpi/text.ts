/**
 * Сравнение названий из отчётов 1С и файлов KPI: имена менеджеров, клиентов,
 * товаров. В файлах встречаются разный регистр, «ё», кавычки, двойные пробелы,
 * перестановка «Фамилия Имя» и латиница вместо кириллицы («Стаут» ↔ «Stout»).
 */

/** Ключ для сравнения: регистр, ё→е, без кавычек и лишних пробелов. */
export function norm(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`„“”]/g, '')
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Ячейка как строка без пробелов по краям. */
export const cellText = (v: unknown) => String(v ?? '').replace(/ /g, ' ').trim();

/**
 * Число из ячейки: «1 234,50 ₽», «1234.5», «1,234.50», «12%» → число; пусто и текст → null.
 * Одна запятая без точки — десятичный разделитель (русская запись).
 */
export function cellNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = cellText(v).replace(/[\s₽%]|руб\.?/gi, '');
  if (!s || !/\d/.test(s)) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Дата в виде YYYY-MM-DD (без часовых поясов). */
export const isoDate = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Последний день месяца (m — 1..12). */
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Первое число месяца даты YYYY-MM-DD. */
export const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Последний день месяца даты YYYY-MM-DD. */
export function monthEnd(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return isoDate(y, m, daysInMonth(y, m));
}

/** Дата из серийного номера Excel (1 — 1 января 1900). */
export function excelSerialDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const monthIndex = (word: string) => {
  const w = word.toLowerCase();
  // «ма» — май/мая: только целым словом, иначе совпадёт с «март».
  if (/^ма[йяе]$/.test(w)) return 5;
  const i = MONTHS.findIndex((m, idx) => idx !== 4 && w.startsWith(m));
  return i < 0 ? 0 : i + 1;
};

/**
 * Даты из текста: «01.06.2026», «1.6.26», «1 июня 2026 г.»; «Июнь 2026» —
 * весь месяц (две даты: первое и последнее число).
 */
export function datesIn(text: string): string[] {
  const out: string[] = [];
  const s = text.toLowerCase();
  const re = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})|(\d{1,2})\s+([а-яё]+)\s+(\d{4})|([а-яё]+)\s+(\d{4})/g;
  for (const m of s.matchAll(re)) {
    if (m[1]) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      const mo = Number(m[2]);
      const d = Number(m[1]);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo)) out.push(isoDate(y, mo, d));
    } else if (m[4]) {
      const mo = monthIndex(m[5]);
      const y = Number(m[6]);
      const d = Number(m[4]);
      if (mo && d >= 1 && d <= daysInMonth(y, mo)) out.push(isoDate(y, mo, d));
    } else if (m[7]) {
      const mo = monthIndex(m[7]);
      const y = Number(m[8]);
      if (mo && y > 2000) out.push(isoDate(y, mo, 1), isoDate(y, mo, daysInMonth(y, mo)));
    }
  }
  return out;
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch',
  ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Слово в «звучание» на латинице: «Хеллес» и «Helles» дают одно и то же. */
function phonetic(word: string): string {
  if (/^\d/.test(word)) return word.replace(',', '.');
  return [...word]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/ch/g, 'sh')
    .replace(/kh/g, 'h')
    .replace(/ph/g, 'f')
    .replace(/w/g, 'v')
    .replace(/x/g, 'ks')
    .replace(/q/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/(.)\1+/g, '$1');
}

/** Слова названия: числа целиком («0,5» — одно слово, «№0» — «0»), буквы — по звучанию. */
export function words(value: unknown): string[] {
  const s = norm(value).replace(/№\s*/g, ' ');
  return (s.match(/\d+(?:[.,]\d+)?|[a-zа-я]+/g) || []).map(phonetic);
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Похожие слова: числа — точно, слова — начало («Крон» → «Krone») или одна-две опечатки. */
function similar(want: string, have: string): boolean {
  if (/^\d/.test(want) || /^\d/.test(have)) return want === have;
  if (have.startsWith(want) || (want.length >= 4 && want.startsWith(have) && have.length >= 4)) return true;
  if (want.length < 4 || have.length < 4) return false;
  return distance(want, have) <= (want.length >= 7 ? 2 : 1);
}

/** Слова, которые в названиях позиций KPI ничего не уточняют («Балтика 0 any»). */
const FILLER = new Set(['any', 'all', 'lyubaya', 'lyuboi', 'lyubye', 'vse']);

/** Подходит ли товар под позицию из файла KPI: каждое слово позиции есть в названии товара. */
export function matchesItem(itemName: string, productName: string): boolean {
  const want = words(itemName).filter((w) => !FILLER.has(w));
  if (!want.length) return false;
  const have = words(productName);
  return want.every((w) => have.some((h) => similar(w, h)));
}

/** Слова имени человека (без инициалов), латиница и кириллица — по звучанию. */
export function personWords(value: unknown): string[] {
  return norm(value)
    .replace(/[^a-zа-я\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1)
    .map(phonetic);
}

/**
 * Насколько имя из отчёта похоже на пользователя: число совпавших слов,
 * если все слова более короткого имени нашлись в длинном. «Мишина Анастасия»
 * и «Анастасия Мишина» — 2; «Анастасия» и «Анастасия Мишина» — 1; разные — 0.
 */
export function personScore(name: string[], candidate: string[]): number {
  if (!name.length || !candidate.length) return 0;
  const [short, long] = name.length <= candidate.length ? [name, candidate] : [candidate, name];
  const pool = [...long];
  for (const w of short) {
    const i = pool.findIndex((p) => p === w || (w.length >= 5 && p.length >= 5 && distance(w, p) <= 1));
    if (i < 0) return 0;
    pool.splice(i, 1);
  }
  return short.length;
}

/** Подходит ли клиент под строку списка: совпадение или вхождение (если строка не слишком короткая). */
export function matchesClient(client: string, pattern: string): boolean {
  const c = norm(client);
  const p = norm(pattern);
  if (!p) return false;
  return c === p || (p.length >= 4 && c.includes(p));
}
