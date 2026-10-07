import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/http';
import type { ClientLists, EmployeeStats, KpiMonth, Period, ReportClient, ReportGroup, SalesImport, SalesReportInfo, SalesSummary, SalesTransaction, Subordinate } from './types';

export const kpiKeys = {
  all: ['kpi'] as const,
  summary: (p: Period) => ['kpi', 'summary', p] as const,
  transactions: (p: Period) => ['kpi', 'transactions', p] as const,
  subordinates: (p: Period) => ['kpi', 'subordinates', p] as const,
  employee: (id: number, p: Period) => ['kpi', 'employee', id, p] as const,
  imports: ['kpi', 'imports'] as const,
  month: (userId: number, month: string) => ['kpi', 'month', userId, month] as const,
  reports: (month: string) => ['kpi', 'reports', month] as const,
  lists: ['kpi', 'lists'] as const,
  clients: (month: string, q: string) => ['kpi', 'report-clients', month, q] as const,
  groups: (month: string) => ['kpi', 'report-groups', month] as const,
  unmatched: ['kpi', 'unmatched'] as const,
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

/** KPI сотрудника за месяц (month — ГГГГ-ММ; пусто — текущий). */
export const useKpiMonth = (userId: number, month: string) =>
  useQuery({
    queryKey: kpiKeys.month(userId, month),
    queryFn: () => api.get<KpiMonth>('/api/kpi/month', { user: userId, month }),
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === userId ? prev : undefined),
    enabled: userId > 0,
  });

export const useSalesReports = (month = '', enabled = true) =>
  useQuery({ queryKey: kpiKeys.reports(month), queryFn: () => api.get<SalesReportInfo[]>('/api/kpi/reports', month ? { month } : undefined), enabled });

export const useClientLists = () => useQuery({ queryKey: kpiKeys.lists, queryFn: () => api.get<ClientLists>('/api/kpi/client-lists') });

export const useReportClients = (month: string, q: string) =>
  useQuery({
    queryKey: kpiKeys.clients(month, q),
    queryFn: () => api.get<ReportClient[]>('/api/kpi/report-clients', { month, q }),
    placeholderData: (prev) => prev,
  });

export const useReportGroups = (month: string, enabled = true) =>
  useQuery({ queryKey: kpiKeys.groups(month), queryFn: () => api.get<ReportGroup[]>('/api/kpi/report-groups', { month }), enabled });

export const useUnmatchedManagers = (enabled = true) =>
  useQuery({
    queryKey: kpiKeys.unmatched,
    queryFn: () => api.get<{ manager_key: string; name: string; revenue: number | null; last_date: string }[]>('/api/kpi/reports/unmatched'),
    enabled,
  });

/** После любой правки целей и продаж обновляем всё, что их показывает. */
export function useKpiRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: kpiKeys.all });
}
