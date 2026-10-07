import { request, upload, UploadFile } from './http';

/**
 * KPI по файлу KPI и ежедневным отчётам о продажах (server/src/services/kpi,
 * описание — docs/KPI.md). Те же данные и действия, что на сайте.
 */

export type KpiKind = 'no_ep' | 'ep' | 'baltika' | 'oph' | 'akb' | 'distra' | 'salary' | 'fuel' | 'fixed' | 'other';

export type FactRule =
  | { type: 'manual' }
  | { type: 'revenue'; groups: string[]; clients: 'all' | 'ep' | 'non_ep'; measure?: 'revenue' | 'quantity' }
  | { type: 'clients'; groups: string[]; excludeEp: boolean; merge: string[] }
  | { type: 'items'; items: { name: string; need: number }[] };

export type PayoutRule =
  | { type: 'none' }
  | { type: 'fixed' }
  | { type: 'threshold'; steps: { from: number; k: number }[]; over: 'cap' | 'proportional' }
  | { type: 'rate'; rate: number; min: number }
  | { type: 'items' };

export interface ItemProgress {
  name: string;
  need: number;
  count: number;
  done: boolean;
}

/** Выплата у цели: сейчас, прогноз на конец месяца, пороги, подсказка (считает сервер). */
export interface TargetCalc {
  kind: KpiKind | null;
  tracked: boolean;
  percent: number;
  now: number | null;
  forecast: number | null;
  forecastValue: number | null;
  forecastPercent: number | null;
  max: number | null;
  marks: number[];
  rule: string;
  hint: string | null;
  items: ItemProgress[] | null;
  asOf: string | null;
}

type Num = number | string;

export interface KpiTarget {
  id: number;
  user_id: number;
  product_name: string | null;
  metric_type: 'quantity' | 'amount' | 'contracts' | 'boolean';
  target_value: Num;
  current_value: Num;
  bonus_amount: Num | null;
  payment_amount: Num | null;
  created_by: number | null;
  period_start: string;
  period_end: string;
  kpi_kind: KpiKind | null;
  source: 'manual' | 'kpi_file';
  unit: string | null;
  fact_rule: FactRule;
  payout_rule: PayoutRule;
  rules_custom: boolean;
  calc: TargetCalc;
}

export interface KpiMonth {
  month: string;
  user: { id: number; name: string };
  targets: KpiTarget[];
  totals: { fixed: number; now: number; forecast: number; max: number; file: number | null };
  coverage: { asOf: string; elapsed: number; days: number; reports: number; uploadedAt: string } | null;
  reports: { id: number; file_name: string; period_start: string; period_end: string; created_at: string; uploaded_by_name: string | null }[];
  months: string[];
  lists: { ep: number; akbMerge: number };
  canEdit: boolean;
  canUpload: boolean;
}

export interface ReportManagerResult {
  manager: string;
  user: string | null;
  userId: number | null;
  total: number;
  ep: number;
  noEp: number;
  clients: number;
  updated: boolean;
  targetsUpdated: number;
  status: 'ok' | 'unmatched' | 'ambiguous' | 'forbidden' | 'no_manager';
  error?: string;
}

export interface ReportImportResult {
  success: boolean;
  report: { id: number; file_name: string; period_start: string; period_end: string; month: string; total_revenue: number } | null;
  replaced: number;
  results: ReportManagerResult[];
  epListEmpty: boolean;
  warnings: string[];
}

export interface SalesReportInfo {
  id: number;
  file_name: string;
  period_start: string;
  period_end: string;
  month: string;
  total_revenue: number;
  created_at: string;
  uploaded_by_name: string | null;
  unmatched: number;
}

export interface KpiFilePreview {
  employeeName: string;
  month: string;
  monthFromFile: string | null;
  hasResults: boolean;
  warnings: string[];
  suggestedUser: { id: number; name: string } | null;
  metrics: {
    name: string;
    kind: KpiKind;
    plan: number;
    bonus: number;
    items: { name: string; need: number }[];
    factRule: FactRule;
    rule: string;
  }[];
}

export interface ClientListEntry {
  id: number;
  kind: 'ep' | 'akb_merge';
  pattern: string;
}

export interface ClientLists {
  ep: ClientListEntry[];
  akb_merge: ClientListEntry[];
}

export interface ReportClient {
  name: string;
  revenue: number | null;
  managers: string[];
  ep_hint: boolean;
  ep: string | null;
  merge: string | null;
}

export interface ReportGroup {
  path: string;
  name: string;
  depth: number;
  revenue: number;
}

export const kpiApi = {
  month: (userId: number, month: string) => request<KpiMonth>('/api/kpi/month', { query: { user: userId, month } }),

  importReport: (file: UploadFile) => upload<ReportImportResult>('/api/kpi/sales/import-report', 'file', file),
  previewKpiFile: (file: UploadFile) => upload<KpiFilePreview>('/api/kpi/import', 'file', file, { dryRun: 1 }),
  importKpiFile: (file: UploadFile, userId: number, month: string) =>
    upload<{ imported: number; replaced: number; month: string; kpis: KpiTarget[] }>('/api/kpi/import', 'file', file, { userId, month }),
  importKpiSheets: (file: UploadFile) =>
    upload<{ results: { employee: string; user?: string; month?: string; created?: number; updated?: number; error?: string }[] }>(
      '/api/kpi/sales/import-kpi-plan',
      'file',
      file,
    ),

  reports: (month?: string) => request<SalesReportInfo[]>('/api/kpi/reports', { query: { month } }),
  deleteReport: (id: number) => request<{ success: boolean }>(`/api/kpi/reports/${id}`, { method: 'DELETE' }),
  unmatched: () => request<{ manager_key: string; name: string; revenue: number | null; last_date: string }[]>('/api/kpi/reports/unmatched'),
  assignManager: (name: string, userId: number) =>
    request<{ months: number; targets: number }>('/api/kpi/reports/aliases', { method: 'POST', body: { name, userId } }),

  lists: () => request<ClientLists>('/api/kpi/client-lists'),
  addToList: (kind: 'ep' | 'akb_merge', names: string[]) =>
    request<{ added: number; lists: ClientLists }>('/api/kpi/client-lists', { method: 'POST', body: { kind, names } }),
  importList: (kind: 'ep' | 'akb_merge', file: UploadFile) =>
    upload<{ found: number; added: number; lists: ClientLists }>('/api/kpi/client-lists/import', 'file', file, { kind }),
  removeFromList: (id: number) => request<{ lists: ClientLists }>(`/api/kpi/client-lists/${id}`, { method: 'DELETE' }),
  reportClients: (month: string, q: string) => request<ReportClient[]>('/api/kpi/report-clients', { query: { month, q } }),
  reportGroups: (month: string) => request<ReportGroup[]>('/api/kpi/report-groups', { query: { month } }),

  saveRules: (targetId: number, data: { fact_rule: FactRule; payout_rule: PayoutRule; bonus_amount: number }) =>
    request<KpiTarget>(`/api/kpi/sales/targets/${targetId}`, { method: 'PATCH', body: data }),
};

/** Показатель из файла KPI или с правилом выплаты — показывается в блоке KPI, а не в «Моих целях». */
export const isKpiTarget = (t: { source?: string; calc?: TargetCalc; payout_rule?: PayoutRule }) =>
  t.source === 'kpi_file' || !!t.calc?.tracked || (!!t.payout_rule && t.payout_rule.type !== 'none');

// ---------- Форматирование ----------

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export const money = (v: unknown) => `${nf0.format(Math.round(toNum(v)))} ₽`;
export const moneyShort = (v: unknown) => {
  const n = toNum(v);
  if (Math.abs(n) >= 1_000_000) return `${nf2.format(Math.round(n / 100_000) / 10)} млн ₽`;
  if (Math.abs(n) >= 10_000) return `${nf0.format(Math.round(n / 1000))} тыс ₽`;
  return money(n);
};
export const numberText = (v: unknown) => nf2.format(toNum(v));

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1] ?? ''} ${y}`;
}
export const monthName = (key: string) => MONTHS[Number(key.split('-')[1]) - 1] ?? '';
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
export function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1] ?? ''}`;
}
export function reportPeriod(start: string, end: string): string {
  if (start === end) return dayMonth(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))}–${dayMonth(end)}`;
  return `${dayMonth(start)} – ${dayMonth(end)}`;
}

/** «План Балтика, руб (порог 90%, …)» → «План Балтика». */
export function kpiTitle(t: { product_name: string | null; kpi_kind: KpiKind | null }): string {
  if (t.kpi_kind === 'ep') return 'Продажи «Есть повод»';
  const name = (t.product_name || 'Показатель')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[,:]?\s*(руб\.?|₽|тт)\s*$/i, '')
    .replace(/[,:]\s*$/, '')
    .trim();
  return name || t.product_name || 'Показатель';
}

/** Значение с единицей: «150 000 ₽», «47 ТТ», «2 поз.». */
export function kpiValue(t: Pick<KpiTarget, 'metric_type' | 'unit'>, v: unknown): string {
  if (t.metric_type === 'amount') return money(v);
  if (t.metric_type === 'boolean') return toNum(v) >= 1 ? 'Да' : 'Нет';
  return `${numberText(v)} ${t.unit || (t.metric_type === 'contracts' ? 'контр.' : 'шт')}`;
}

/** «1 234,5» → 1234.5; пусто или мусор → NaN. */
export function parseNumber(v: string): number {
  const s = v.replace(/[\s ₽%]/g, '').replace(',', '.');
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
