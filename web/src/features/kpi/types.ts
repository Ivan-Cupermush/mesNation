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
