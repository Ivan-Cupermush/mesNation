/** Данные раздела «Статистика» (server/src/routes/kpiSales.ts, kpiImport.ts). */

export type Period = 'week' | 'month' | 'quarter';
/** boolean — показатель «да/нет» из файла KPI сотрудника (план 1, факт 0 или 1). */
export type MetricType = 'quantity' | 'amount' | 'contracts' | 'boolean';

/** Числа numeric приходят из PostgreSQL строками — приводим через Number() при показе. */
type Num = number | string;

export interface SalesTarget {
  id: number;
  user_id: number;
  product_name: string | null;
  metric_type: MetricType;
  target_value: Num;
  current_value: Num;
  progress_percent: Num | null;
  period_start: string;
  period_end: string;
  description: string | null;
  is_personal_monthly_target?: boolean;
  created_by?: number | null;
  bonus_amount?: Num | null;
  payment_amount?: Num | null;
  target_percent?: Num | null;
  created_at?: string;
  updated_at?: string;
  /** Есть у целей из сводки и карточки сотрудника (сервер считает выплаты). */
  source?: 'manual' | 'kpi_file';
  payout_rule?: PayoutRule;
  calc?: TargetCalc;
}

export interface SalesTransaction {
  id: number;
  product_name: string;
  quantity: Num;
  amount: Num;
  transaction_date: string;
  client_name: string | null;
  notes: string | null;
  target_id?: number | null;
  import_id?: number | null;
}

export interface SalesSummary {
  fact: { total_amount: Num; total_quantity: Num; total_transactions: Num };
  targets: SalesTarget[];
  personalTarget: SalesTarget | null;
  topProducts: { product_name: string; total_quantity: Num; total_amount: Num; transactions_count: Num }[];
  period: Period;
}

export interface Subordinate {
  user_id: number;
  username: string;
  display_name: string | null;
  role_name: string | null;
  total_amount: Num;
  kpis: Pick<SalesTarget, 'id' | 'product_name' | 'metric_type' | 'target_value' | 'current_value' | 'progress_percent' | 'period_start' | 'period_end'>[];
}

export interface EmployeeStats {
  user: {
    id: number;
    username: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    is_active: boolean;
    role_name: string | null;
    role_id: number | null;
  };
  kpis: (SalesTarget & { progress: number })[];
  tasks: { id: number; title: string; status: string; priority: string; deadline: string | null; is_overdue: boolean | null }[];
  taskStats: { total: number; completed: number; in_progress: number; overdue: number };
  summary: { total_amount: Num; total_quantity: Num; total_transactions: Num };
  transactions: SalesTransaction[];
}

export interface ImportPreview {
  importId: number;
  fileName: string;
  totalRows: number;
  preview: Record<string, unknown>[];
  headers: string[];
  suggestedMapping: Record<MappingField, string | null>;
  validation: { valid: number; invalid: number; errors: string[] };
  totalAmount: number;
}

export type MappingField = 'product_name' | 'quantity' | 'amount' | 'transaction_date' | 'client_name' | 'notes';

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  totalAmount: number;
  errors: string[];
}

export interface SalesImport {
  id: number;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  total_amount: Num;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
}

// ---------- KPI по отчётам о продажах (server/src/services/kpi) ----------

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

/** Расчёт выплаты у цели: сейчас, прогноз на конец месяца, пороги, подсказка. */
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

export interface KpiTarget extends SalesTarget {
  kpi_kind: KpiKind | null;
  source: 'manual' | 'kpi_file';
  unit: string | null;
  fact_rule: FactRule;
  payout_rule: PayoutRule;
  rules_custom: boolean;
  file_fact: Num | null;
  calc: TargetCalc;
}

export interface KpiCoverage {
  asOf: string;
  elapsed: number;
  days: number;
  reports: number;
  uploadedAt: string;
}

export interface KpiTotals {
  fixed: number;
  now: number;
  forecast: number;
  max: number;
  file: number | null;
}

export interface KpiMonth {
  month: string;
  user: { id: number; name: string };
  targets: KpiTarget[];
  totals: KpiTotals;
  coverage: KpiCoverage | null;
  reports: { id: number; file_name: string; period_start: string; period_end: string; created_at: string; uploaded_by_name: string | null }[];
  months: string[];
  lists: { ep: number; akbMerge: number };
  canEdit: boolean;
  canUpload: boolean;
}

export interface SalesReportInfo {
  id: number;
  file_name: string;
  period_start: string;
  period_end: string;
  month: string;
  total_revenue: number;
  created_at: string;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  managers: number;
  unmatched: number;
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

export interface ClientListEntry {
  id: number;
  kind: 'ep' | 'akb_merge';
  pattern: string;
  created_at: string;
  created_by_name: string | null;
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

export interface KpiFilePreview {
  dryRun: true;
  employeeName: string;
  month: string;
  monthFromFile: string | null;
  hasResults: boolean;
  warnings: string[];
  suggestedUser: { id: number; name: string } | null;
  metrics: {
    name: string;
    kind: KpiKind;
    fixed: boolean;
    plan: number;
    fact: number | null;
    bonus: number;
    payment: number | null;
    rate: number | null;
    items: { name: string; need: number; fileCount: number | null; fileDone: boolean | null }[];
    factRule: FactRule;
    payoutRule: PayoutRule;
    rule: string;
  }[];
}
