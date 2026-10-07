import * as XLSX from 'xlsx';
import { badRequest } from '../../lib/errors';
import { cellNumber, cellText, datesIn, monthOf, norm } from './text';

/**
 * Отчёт о продажах из 1С («Валовая прибыль предприятия»):
 *
 *   Период: 01.06.2026 - 30.06.2026
 *   Клиент                                   Количество  Выручка
 *   ООО Ромашка                                      257    55 448      ← клиент
 *   По менеджерам
 *   Иванов Иван                                      257    55 448      ← менеджер клиента
 *          ПИВО                                       12     2 557      ← группы товаров
 *            Пиво фасованное / … / Фасовка Балтика    12     2 557
 *   00001234  Пиво Балтика №3 0,5 ст.б.*20,           12     2 557      ← товар
 *   …
 *   Итого                                          90 910  18 997 284
 *
 * Вложенность групп берётся из уровней группировки строк Excel (их сохраняет
 * 1С); если их нет (старый .xls) — восстанавливается по суммам: группа равна
 * сумме вложенных строк, а товар заканчивается на «, » (пустая характеристика)
 * или имеет артикул.
 */

export interface ReportNode {
  kind: 'group' | 'item';
  /** 1 — верхняя группа (ПИВО, СИДР…). */
  depth: number;
  /** Названия групп выше этой строки. */
  path: string[];
  name: string;
  quantity: number;
  revenue: number;
}

export interface ReportBlock {
  client: string;
  manager: string;
  quantity: number;
  revenue: number;
  nodes: ReportNode[];
}

export interface SalesReport {
  /** YYYY-MM-DD */
  periodStart: string;
  periodEnd: string;
  month: string;
  blocks: ReportBlock[];
  /** Сумма выручки по всем клиентам. */
  total: number;
  /** Строка «Итого» из файла, если есть. */
  fileTotal: number | null;
  warnings: string[];
}

interface RawRow {
  a: string;
  /** Как в файле — у товаров без артикула там бывают пробелы. */
  aRaw: string;
  name: string;
  quantity: number;
  revenue: number;
  level: number;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const HEADER_LABELS = new Set(['клиент', 'менеджер', 'артикул']);

/** Число выручки/количества: из найденной колонки, иначе последнее число в строке. */
function numbersOf(row: unknown[], qtyCol: number | null, revCol: number | null) {
  if (revCol != null) return { quantity: cellNumber(row[qtyCol ?? -1]) ?? 0, revenue: cellNumber(row[revCol]) ?? 0 };
  const nums = row.map(cellNumber).filter((n): n is number => n != null);
  return { quantity: nums.length > 1 ? nums[nums.length - 2] : 0, revenue: nums.length ? nums[nums.length - 1] : 0 };
}

function findPeriod(rows: unknown[][]): { start: string; end: string; row: number } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const text = rows[i].map(cellText).join(' ');
    if (!/период/i.test(text)) continue;
    const dates = datesIn(text.slice(text.toLowerCase().indexOf('период')));
    if (dates.length) {
      const sorted = [...dates].sort();
      return { start: sorted[0], end: sorted[sorted.length - 1], row: i };
    }
  }
  return null;
}

/** Вложенность и тип строк товаров внутри одного менеджера. */
function buildTree(rows: RawRow[], useLevels: boolean): ReportNode[] {
  if (!rows.length) return [];
  if (useLevels) {
    const base = Math.min(...rows.map((r) => r.level));
    const stack: string[] = [];
    return rows.map((r, i) => {
      const depth = r.level - base + 1;
      const next = rows[i + 1];
      const kind = next && next.level > r.level ? 'group' : 'item';
      stack.length = depth - 1;
      const node: ReportNode = { kind, depth, path: stack.filter(Boolean), name: cleanName(r.name, kind), quantity: r.quantity, revenue: r.revenue };
      if (kind === 'group') stack[depth - 1] = node.name;
      return node;
    });
  }

  // Без уровней: открытые группы ждут, пока сумма вложенных строк не сравняется с их итогом.
  type Open = { node: ReportNode; leftQty: number; leftRev: number; children: number };
  const stack: Open[] = [];
  const out: ReportNode[] = [];
  for (const r of rows) {
    while (stack.length) {
      const top = stack[stack.length - 1];
      const done = near(top.leftRev, 0) && near(top.leftQty, 0);
      const fits = r.revenue <= top.leftRev + 0.01 && r.quantity <= top.leftQty + 0.01;
      if (!done && fits) break;
      // Не вместилась первая же строка — это был товар, а не группа.
      if (!top.children) top.node.kind = 'item';
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    // У товаров в первой колонке артикул (или пробелы), у групп она пустая.
    const leafHint = /,\s*$/.test(r.name) || r.aRaw !== '';
    const node: ReportNode = {
      kind: leafHint ? 'item' : 'group',
      depth: stack.length + 1,
      path: stack.map((s) => s.node.name),
      name: r.name,
      quantity: r.quantity,
      revenue: r.revenue,
    };
    if (parent) {
      parent.leftQty -= r.quantity;
      parent.leftRev -= r.revenue;
      parent.children++;
    }
    out.push(node);
    if (node.kind === 'group') stack.push({ node, leftQty: r.quantity, leftRev: r.revenue, children: 0 });
  }
  for (const s of stack) if (!s.children) s.node.kind = 'item';
  return out.map((n) => ({ ...n, name: cleanName(n.name, n.kind), path: n.path.map((p) => cleanName(p, 'group')) }));
}

/** «Пиво Балтика №3 0,5 ст.б.*20, » → «Пиво Балтика №3 0,5 ст.б.*20» (пустая характеристика). */
function cleanName(name: string, kind: ReportNode['kind']): string {
  const s = name.replace(/\s+/g, ' ').trim();
  return kind === 'item' ? s.replace(/,\s*$/, '') : s;
}

/** ignoreLevels — только для проверки разбора старых .xls без уровней группировки. */
export function parseSalesReport(buffer: Buffer, options: { ignoreLevels?: boolean } = {}): SalesReport {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
  } catch {
    throw badRequest('Не удалось прочитать файл. Сохраните отчёт из 1С в Excel (.xlsx) и загрузите ещё раз.');
  }
  const sheets = wb.SheetNames.map((name) => wb.Sheets[name]).filter(Boolean);
  const read = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: true, raw: true });
  const ws = sheets.find((s) => read(s).some((r) => norm(r[0]) === 'по менеджерам')) ?? sheets[0];
  if (!ws) throw badRequest('Файл пустой');
  const rows = read(ws);
  const firstRow = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
  const meta = (!options.ignoreLevels && ws['!rows']) || [];
  const levelOf = (i: number) => meta[firstRow + i]?.level ?? 0;

  const period = findPeriod(rows);
  if (!period) throw badRequest('В отчёте не найден период. Нужна строка вида «Период: 01.06.2026 - 30.06.2026», как в отчёте 1С.');
  if (monthOf(period.start) !== monthOf(period.end)) {
    throw badRequest('Отчёт захватывает несколько месяцев. KPI считаются по месяцам — сформируйте отчёт в пределах одного месяца.');
  }

  // Шапка: колонки «Количество», «Выручка» и «Номенклатура» (строки «Клиент / Менеджер / Артикул»).
  let header = -1;
  let qtyCol: number | null = null;
  let revCol: number | null = null;
  let nameCol = 3;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map(norm);
    const rev = cells.findIndex((c) => c.startsWith('выручка'));
    if (rev >= 0) {
      revCol = rev;
      const qty = cells.findIndex((c) => c.startsWith('количество'));
      qtyCol = qty >= 0 ? qty : null;
      header = i;
    }
    const nm = cells.findIndex((c) => c.startsWith('номенклатура'));
    if (nm > 0) nameCol = nm;
    if (header >= 0 && (nm > 0 || HEADER_LABELS.has(cells[0]))) header = i;
  }
  const start = header >= 0 ? header + 1 : period.row + 1;

  const warnings: string[] = [];
  const raw: { kind: 'client' | 'manager' | 'product'; row: RawRow }[] = [];
  let fileTotal: number | null = null;
  const nextFilled = (i: number) => {
    for (let j = i + 1; j < rows.length; j++) if (rows[j].some((c) => cellText(c))) return rows[j];
    return null;
  };
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const a = cellText(row[0]);
    const name = String(row[nameCol] ?? '').replace(/ /g, ' ');
    if (!a && !name.trim()) continue;
    if (/^итого/i.test(a)) {
      fileTotal = numbersOf(row, qtyCol, revCol).revenue;
      break;
    }
    if (norm(a) === 'по менеджерам') continue;
    const r: RawRow = { a, aRaw: String(row[0] ?? ''), name, level: levelOf(i), ...numbersOf(row, qtyCol, revCol) };
    if (a && !name.trim()) {
      const next = nextFilled(i);
      raw.push({ kind: next && norm(next[0]) === 'по менеджерам' ? 'client' : 'manager', row: r });
    } else {
      raw.push({ kind: 'product', row: r });
    }
  }

  const useLevels = raw.some((r) => r.kind === 'product' && r.row.level > 0);
  const blocks: ReportBlock[] = [];
  let client: RawRow | null = null;
  let current: { block: ReportBlock; rows: RawRow[] } | null = null;
  const flush = () => {
    if (current) current.block.nodes = buildTree(current.rows, useLevels);
    current = null;
  };
  for (const item of raw) {
    if (item.kind === 'client') {
      flush();
      client = item.row;
    } else if (item.kind === 'manager') {
      flush();
      if (!client) {
        warnings.push(`Строка «${item.row.a}» без клиента — пропущена`);
        continue;
      }
      current = {
        block: { client: client.a, manager: item.row.a.replace(/\s+/g, ' '), quantity: item.row.quantity, revenue: item.row.revenue, nodes: [] },
        rows: [],
      };
      blocks.push(current.block);
    } else {
      if (!current && client) {
        // Клиент без раздела «По менеджерам» — продажи без менеджера.
        current = { block: { client: client.a, manager: '', quantity: client.quantity, revenue: client.revenue, nodes: [] }, rows: [] };
        blocks.push(current.block);
      }
      if (current) current.rows.push(item.row);
    }
  }
  flush();

  if (!blocks.length) {
    throw badRequest('Не похоже на отчёт о продажах из 1С: не найден раздел «По менеджерам» под клиентами.');
  }
  const total = Math.round(blocks.reduce((s, b) => s + b.revenue, 0) * 100) / 100;
  // Копейки на округлении строк не считаем расхождением.
  if (fileTotal != null && Math.abs(fileTotal - total) >= 1) {
    const rub = (n: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)} ₽`;
    warnings.push(`Сумма по клиентам (${rub(total)}) не совпадает со строкой «Итого» (${rub(fileTotal)}) — проверьте, что отчёт выгружен целиком`);
  }
  return { periodStart: period.start, periodEnd: period.end, month: monthOf(period.start), blocks, total, fileTotal, warnings };
}
