import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/http';
import type { EmployeeStats, Period, SalesImport, SalesSummary, SalesTransaction, Subordinate } from './types';

export const kpiKeys = {
  all: ['kpi'] as const,
  summary: (p: Period) => ['kpi', 'summary', p] as const,
  transactions: (p: Period) => ['kpi', 'transactions', p] as const,
  subordinates: (p: Period) => ['kpi', 'subordinates', p] as const,
  employee: (id: number, p: Period) => ['kpi', 'employee', id, p] as const,
  imports: ['kpi', 'imports'] as const,
};

export const useSalesSummary = (period: Period) =>
  useQuery({ queryKey: kpiKeys.summary(period), queryFn: () => api.get<SalesSummary>('/api/kpi/sales/summary', { period }), placeholderData: (prev) => prev });

export const useTransactions = (period: Period) =>
  useQuery({ queryKey: kpiKeys.transactions(period), queryFn: () => api.get<SalesTransaction[]>('/api/kpi/sales/transactions', { period }), placeholderData: (prev) => prev });

export const useSubordinates = (period: Period, enabled = true) =>
  useQuery({
    queryKey: kpiKeys.subordinates(period),
    queryFn: () => api.get<Subordinate[]>('/api/kpi/sales/subordinates', { period }),
    placeholderData: (prev) => prev,
    enabled,
  });

export const useEmployeeStats = (userId: number, period: Period) =>
  useQuery({
    queryKey: kpiKeys.employee(userId, period),
    queryFn: () => api.get<EmployeeStats>(`/api/kpi/sales/employee/${userId}/stats`, { period }),
    // При смене периода показываем прежние цифры до ответа, но не цифры другого сотрудника.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === userId ? prev : undefined),
    enabled: userId > 0,
  });

export const useImportHistory = () =>
  useQuery({ queryKey: kpiKeys.imports, queryFn: () => api.get<SalesImport[]>('/api/kpi/sales/import/history') });

/** После любой правки целей и продаж обновляем всё, что их показывает. */
export function useKpiRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: kpiKeys.all });
}
