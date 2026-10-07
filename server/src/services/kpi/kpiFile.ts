import * as XLSX from 'xlsx';
import { badRequest } from '../../lib/errors';
import { cellNumber, cellText, datesIn, excelSerialDate, monthOf, norm } from './text';

/**
 * Файл KPI сотрудника (как его ведёт заказчик):
 *
 *   A                                   B              C (план)   D (факт)
 *   Анастасия                                                                ← сотрудник
 *   01.05.2026                                                   Факт Анастасия ← месяц
 *   Оклад                                              30 000     30 000      ← фиксированные
 *   АКБ (Порог 100%), ТТ (без учета ЕП…) план, ТТ          44         44
 *                                       факт               44         46
 *                                       % выполнения        1       1,045
 *                                       бонус           5 000      5 000
 *                                       к выплате       5 000      5 000
 *   Дистра Балтика:                     план, ТТ           да         да
 *   Балтика Стаут кег - 1 ТТ V          факт  …                               ← позиции
 *   …
 *   Продажи Есть Повод (Порог 200 000)  факт      400 000    400 000          ← первая строка — план
 *                                       факт      400 000    390 230
 *                                        %          0,035      0,035          ← ставка, а не %
 *
 * Колонка C — значения «если план выполнен», D — фактические. В начале месяца
 * колонка D может быть пустой: тогда в файле только план и бонусы.
 */

export type KpiKind = 'no_ep' | 'ep' | 'baltika' | 'oph' | 'akb' | 'distra' | 'salary' | 'fuel' | 'fixed' | 'other';

export interface KpiItem {
  name: string;
  /** Сколько точек нужно. */
  need: number;
  /** Сколько точек по файлу, если указано («(4)»). */
  fileCount: number | null;
  /** Отметка в файле: V — выполнено, X — нет. */
  fileDone: boolean | null;
}

export interface KpiMetric {
  name: string;
  kind: KpiKind;
  fixed: boolean;
  plan: number;
  fact: number | null;
  /** Бонус при выполнении плана. */
  bonus: number;
  /** К выплате по файлу (null — в файле нет итогов). */
  payment: number | null;
  /** Ставка от продаж (0,035 = 3,5%), если в строке «%» ставка, а не выполнение. */
  rate: number | null;
  filePercent: number | null;
  items: KpiItem[];
  /** План и факт в файле — «да/нет». */
  yesNo: boolean;
}

export interface KpiFile {
  employeeName: string;
  /** Первое число месяца YYYY-MM-DD, если в файле есть дата. */
  month: string | null;
  metrics: KpiMetric[];
  /** В файле есть фактические выплаты (итоговый файл за месяц). */
  hasResults: boolean;
  warnings: string[];
}

type RowType = 'plan' | 'fact' | 'percent' | 'bonus' | 'payment';
const CYCLE: RowType[] = ['plan', 'fact', 'percent', 'bonus', 'payment'];

function rowType(label: string): RowType | 'total' | null {
  const s = norm(label);
  if (!s) return null;
  if (s.includes('итого')) return 'total';
  if (s.includes('план')) return 'plan';
  if (s.includes('факт')) return 'fact';
  if (s.includes('бонус')) return 'bonus';
  if (s.includes('выплат')) return 'payment';
  if (s.includes('%') || s.includes('выполн')) return 'percent';
  return null;
}

const expectedNext = (last: RowType | null): RowType => {
  const i = last ? CYCLE.indexOf(last) : -1;
  return i < 0 || i === CYCLE.length - 1 ? 'plan' : CYCLE[i + 1];
};

/** Ячейка-число; «да/нет» → 1/0. */
function value(v: unknown): { n: number | null; yesNo: boolean } {
  const s = norm(v);
  if (s === 'да') return { n: 1, yesNo: true };
  if (s === 'нет') return { n: 0, yesNo: true };
  return { n: cellNumber(v), yesNo: false };
}

/** Вид показателя по названию. Опечатки из реальных файлов («Есть Подод») учтены. */
export function kindOf(name: string, fixed: boolean): KpiKind {
  const s = norm(name);
  if (fixed) {
    if (s.startsWith('оклад')) return 'salary';
    if (/гсм|топлив|бензин/.test(s)) return 'fuel';
    return 'fixed';
  }
  const word = (w: string) => new RegExp(`(^|[^а-яa-z])${w}([^а-яa-z]|$)`).test(s);
  if (/без\s*(еп|есть\s*по[вд]о[дт])/.test(s)) return 'no_ep';
  if (word('акб')) return 'akb';
  if (s.includes('дистр')) return 'distra';
  if (/есть\s*по[вд]о[дт]/.test(s) || word('еп')) return 'ep';
  if (s.includes('балтик')) return 'baltika';
  if (word('опх') || /heineken|хейнекен/.test(s)) return 'oph';
  return 'other';
}

/** «Балтика 0 any - 5 ТТ (4) X» → позиция «Балтика 0 any», нужно 5 точек, по файлу 4, не выполнено. */
export function parseItem(text: string): KpiItem {
  const s = text.replace(/\s+/g, ' ').trim();
  const m = s.match(/^(.*?)\s*[-–—]\s*(\d+)\s*тт\.?\s*(?:\((\d+)\))?\s*([vxх✓✔✗✘+])?\s*$/i);
  if (!m) {
    const mark = s.match(/\s([vxх✓✔✗✘+])$/i);
    return { name: mark ? s.slice(0, -2).trim() : s, need: 1, fileCount: null, fileDone: mark ? /[v✓✔+]/i.test(mark[1]) : null };
  }
  return {
    name: m[1].trim(),
    need: Math.max(1, Number(m[2])),
    fileCount: m[3] != null ? Number(m[3]) : null,
    fileDone: m[4] ? /[v✓✔+]/i.test(m[4]) : null,
  };
}

interface Draft {
  name: string;
  fixed: boolean;
  plan: number | null;
  fact: number | null;
  bonus: number | null;
  payment: number | null;
  percent: number | null;
  /** Строка «%» без слова «выполнение» — возможно, ставка. */
  percentBare: boolean;
  yesNo: boolean;
  last: RowType | null;
  subItems: string[];
}

export function parseKpiSheet(rows: unknown[][]): KpiFile {
  const warnings: string[] = [];
  // Колонка факта — та, где в шапке «Факт …»; план — слева от неё.
  let factCol = 3;
  for (const row of rows.slice(0, 5)) {
    const i = row.findIndex((c) => /^факт/i.test(cellText(c)));
    if (i >= 2) {
      factCol = i;
      break;
    }
  }
  const planCol = factCol - 1;

  let employeeName = '';
  let month: string | null = null;
  // Месяц — дата в первых строках (число Excel 2015–2099, дата или текст «01.05.2026»).
  for (const row of rows.slice(0, 3)) {
    for (const c of row) {
      if (month) break;
      if (typeof c === 'number') month = c >= 42005 && c <= 73050 ? excelSerialDate(c) : null;
      else if (c instanceof Date) month = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-01`;
      else if (typeof c === 'string' && /\d/.test(c)) month = datesIn(c)[0] ?? null;
    }
    if (month) month = monthOf(month);
  }
  for (const row of rows.slice(0, 3)) {
    const a = cellText(row[0]);
    if (a && !/\d/.test(a) && !rowType(cellText(row[1])) && !cellText(row[planCol]) && kindOf(a, false) === 'other' && !/оклад|гсм/i.test(a)) {
      employeeName = a.replace(/\s+/g, ' ');
      break;
    }
  }
  if (!employeeName) {
    const header = rows.slice(0, 5).flat().map(cellText).find((c) => /^факт\s+\S/i.test(c));
    if (header) employeeName = header.replace(/^факт\s+/i, '').trim();
  }

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  for (const row of rows) {
    const a = cellText(row[0]).replace(/\s+/g, ' ');
    const type = rowType(cellText(row[1]));
    const c = value(row[planCol]);
    const d = value(row[factCol]);
    if (/^итого/i.test(a) || type === 'total') continue;
    if (a === employeeName && !type) continue;

    if (!type) {
      // Оклад, ГСМ: название и сумма без строк план/факт.
      if (a && (c.n != null || d.n != null) && !/^\d/.test(a) && !/^факт/i.test(a)) {
        const amount = d.n ?? c.n ?? 0;
        current = { name: a, fixed: true, plan: c.n ?? amount, fact: amount, bonus: c.n ?? amount, payment: d.n, percent: null, percentBare: false, yesNo: false, last: null, subItems: [] };
        drafts.push(current);
      }
      continue;
    }

    const continues =
      current != null && !current.fixed && (!a || a === current.name || (type !== 'plan' && expectedNext(current.last) === type));
    if (!continues) {
      current = { name: a || `Показатель ${drafts.length + 1}`, fixed: false, plan: null, fact: null, bonus: null, payment: null, percent: null, percentBare: false, yesNo: false, last: null, subItems: [] };
      drafts.push(current);
    } else if (a && a !== current!.name) {
      current!.subItems.push(a);
    }
    const m = current!;
    if (c.yesNo || d.yesNo) m.yesNo = true;
    if (type === 'plan') m.plan = d.n ?? c.n;
    else if (type === 'fact') {
      // Первая строка показателя подписана «факт», но это план (так в файлах заказчика).
      if (m.plan == null) {
        m.plan = c.n ?? d.n;
        m.fact = d.n;
      } else m.fact = d.n;
    } else if (type === 'percent') {
      m.percent = d.n ?? c.n;
      m.percentBare = !/выполн/i.test(cellText(row[1]));
    } else if (type === 'bonus') m.bonus = c.n ?? d.n;
    else if (type === 'payment') m.payment = d.n;
    m.last = type;
  }

  const metrics: KpiMetric[] = drafts.map((m) => {
    const name = m.name.replace(/[:\s]+$/, '');
    const kind = kindOf(name, m.fixed);
    let plan = m.plan ?? 0;
    let fact = m.fact;
    const bonus = m.bonus ?? 0;
    const items = kind === 'distra' || m.subItems.length ? m.subItems.map(parseItem) : [];
    if (items.length && (m.yesNo || kind === 'distra')) {
      plan = items.length;
      const marked = items.filter((i) => i.fileDone != null);
      fact = marked.length ? items.filter((i) => i.fileDone).length : null;
    }
    // «%» со ставкой: бонус = план × ставка (3,5% от продаж), а не процент выполнения.
    const p = m.percent;
    const isRate =
      p != null && p > 0 && p < 1 && m.percentBare && plan > 0 &&
      (Math.abs(bonus - plan * p) <= Math.max(1, bonus * 0.01) || (fact != null && m.payment != null && Math.abs(m.payment - fact * p) <= Math.max(1, m.payment * 0.01)));
    return {
      name,
      kind,
      fixed: m.fixed,
      plan,
      fact,
      bonus: m.fixed ? plan : bonus,
      payment: m.payment,
      rate: isRate ? p : null,
      filePercent: isRate || p == null ? null : p <= 5 ? Math.round(p * 1000) / 10 : p,
      items,
      yesNo: m.yesNo && !items.length,
    };
  });

  for (const m of metrics) {
    if (!m.fixed && !m.plan) warnings.push(`«${m.name}»: не найден план`);
  }
  const hasResults = metrics.some((m) => !m.fixed && m.payment != null);
  return { employeeName, month, metrics, hasResults, warnings };
}

function readBook(buffer: Buffer): XLSX.WorkBook {
  try {
    return XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw badRequest('Не удалось прочитать файл. Сохраните его в Excel (.xlsx) и загрузите ещё раз.');
  }
}

const sheetRows = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });

/** Файл KPI одного сотрудника — первый лист. */
export function parseKpiFile(buffer: Buffer): KpiFile {
  const wb = readBook(buffer);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw badRequest('Файл пустой');
  return parseKpiSheet(sheetRows(ws));
}

/** Файл, где каждый лист — KPI отдельного сотрудника (имя — в ячейке A1 или название листа). */
export function parseKpiSheets(buffer: Buffer): (KpiFile & { sheet: string })[] {
  const wb = readBook(buffer);
  return wb.SheetNames.map((sheet) => {
    const parsed = parseKpiSheet(sheetRows(wb.Sheets[sheet]));
    return { ...parsed, sheet, employeeName: parsed.employeeName || sheet };
  }).filter((f) => f.metrics.length > 0);
}
