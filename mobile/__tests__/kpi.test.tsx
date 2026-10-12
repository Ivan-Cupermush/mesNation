/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import KpiCard from '../src/components/kpi/KpiCard';
import SalesTiles, { statsCaption } from '../src/components/kpi/SalesTiles';
import { PermissionPicker } from '../src/components/PermissionToggles';
import { can } from '../src/services/api';
import { isKpiTarget, isManualTarget, KpiTarget, kpiTitle, money, reportPeriod, SalesStats, shiftMonth } from '../src/services/kpi';

const target: KpiTarget = {
  id: 1,
  user_id: 3,
  product_name: 'План Балтика, руб (порог 90%, При выполнении 80-90% кэф 0,5)',
  metric_type: 'amount',
  target_value: '800000.00',
  current_value: '431900.00',
  bonus_amount: '12000',
  payment_amount: null,
  created_by: 2,
  period_start: '2026-05-01',
  period_end: '2026-05-31',
  kpi_kind: 'baltika',
  source: 'kpi_file',
  unit: null,
  fact_rule: { type: 'revenue', groups: ['балтика'], clients: 'all' },
  payout_rule: { type: 'threshold', steps: [{ from: 90, k: 1 }, { from: 80, k: 0.5 }], over: 'proportional' },
  rules_custom: false,
  calc: {
    kind: 'baltika', tracked: true, percent: 54, now: 0, forecast: 13389, forecastValue: 892593, forecastPercent: 111.6,
    max: 12000, marks: [80, 90], rule: 'от 90% — 12 000 ₽', hint: 'До 80% — ещё 208 100 ₽', items: null, asOf: '2026-05-15',
  },
};

/** Весь текст дерева одной строкой (React Native разбивает текст с подстановками на части). */
function textOf(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children);
}

const render = async (el: React.ReactElement) => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(el);
  });
  return textOf(tree!.toJSON());
};

test('цель по отчёту о продажах: факт, прогноз выплаты, пороги и подсказка', async () => {
  const report: KpiTarget = { ...target, source: 'manual', calc: { ...target.calc, source: 'report' } };
  const text = await render(<KpiCard target={report} monthEnd="2026-05-31" onMenu={() => {}} />);
  expect(text).toContain('План Балтика');
  expect(text).toContain('по отчёту о продажах');
  expect(text).toContain('Прогноз на 31 мая');
  expect(text).toContain('80%');
  expect(text).toContain('До 80% — ещё 208 100 ₽');
});

test('KPI из файла: всё по файлу, условие из названия, прогноз только в процентах', async () => {
  const file: KpiTarget = {
    ...target,
    payment_amount: '6000',
    calc: { ...target.calc, source: 'file', tracked: false, now: 6000, forecast: 6000, asOf: '2026-05-12', condition: 'порог 90%, При выполнении 80-90% кэф 0,5' },
  };
  const text = await render(<KpiCard target={file} monthEnd="2026-05-31" />);
  expect(text).toContain('по файлу KPI от 12 мая');
  expect(text).toContain('Условие: порог 90%, При выполнении 80-90% кэф 0,5');
  expect(text).toContain('При текущем темпе к 31 мая — ≈112%');
  expect(text).not.toContain('Прогноз на 31 мая');
});

test('позиции без галочек: выполнение в процентах из файла', async () => {
  const pct: KpiTarget = {
    ...target,
    kpi_kind: 'distra',
    metric_type: 'quantity',
    unit: '%',
    target_value: 100,
    current_value: 80,
    calc: { ...target.calc, source: 'file', percent: 80, marks: [], items: null, forecastPercent: null, hint: 'Позиции: Охота, Бочкарев' },
  };
  const text = await render(<KpiCard target={pct} monthEnd={null} />);
  expect(text).toContain('Выполнено 80%');
  expect(text).toContain('Позиции: Охота, Бочкарев');
});

test('квадратики продаж из отчёта', async () => {
  const stats: SalesStats = { revenue: 93600, akb: 4, perDay: 9360, quantity: 108, asOf: '2026-10-11', elapsed: 11, days: 31, workElapsed: 10, workDays: 27, reports: 1, uploadedAt: '' };
  const text = await render(<SalesTiles stats={stats} />);
  expect(text).toContain('Выручка');
  expect(text).toContain('АКБ, точек');
  expect(text).toContain('В среднем за рабочий день');
  expect(text).toContain('Продано, шт');
  expect(text).toContain(money(9360));
  expect(statsCaption(stats, '2026-10')).toContain('на 11 октября · рабочих дней: 10 из 27');
  expect(statsCaption(null, '2026-10')).toContain('за октябрь пока нет');
  expect(await render(<SalesTiles stats={null} />)).toContain('—');
});

test('функции сотрудника: по должности и вручную', async () => {
  expect(can({ is_director: false, has_subordinates: false, permissions: { sales_reports: true } }, 'sales_reports')).toBe(true);
  expect(can({ is_director: false, has_subordinates: true, permissions: { kpi_files: false } }, 'kpi_files')).toBe(false);
  expect(can({ is_director: false, has_subordinates: true }, 'kpi_assign')).toBe(true);
  expect(can({ is_director: true, has_subordinates: false, permissions: { kpi_assign: false } }, 'kpi_assign')).toBe(true);
  expect(can(null, 'kpi_assign')).toBe(false);
  const text = await render(<PermissionPicker byRole={false} value={{ sales_reports: true }} onChange={() => {}} />);
  expect(text).toContain('Загрузка отчётов о продажах');
  expect(text).toContain('включено вручную');
});

test('позиции дистрибуции', async () => {
  const distra: KpiTarget = {
    ...target,
    kpi_kind: 'distra',
    metric_type: 'quantity',
    unit: 'поз.',
    target_value: 4,
    current_value: 3,
    calc: { ...target.calc, items: [{ name: 'Крон Бланш', need: 1, count: 0, done: false }], marks: [], forecast: null, forecastValue: null },
  };
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<KpiCard target={distra} monthEnd={null} />);
  });
  expect(textOf(tree!.toJSON())).toContain('Крон Бланш');
});

test('форматирование и отбор показателей', () => {
  expect(kpiTitle({ product_name: 'Продажи Есть Подод, руб (Порог 200 000 руб)', kpi_kind: 'ep' })).toBe('Продажи «Есть повод»');
  expect(kpiTitle(target)).toBe('План Балтика');
  expect(reportPeriod('2026-05-01', '2026-05-15')).toBe('1–15 мая');
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  expect(money(1234.6)).toBe('1 235 ₽'.replace('1 235', new Intl.NumberFormat('ru-RU').format(1235)));
  expect(isKpiTarget(target)).toBe(true);
  expect(isKpiTarget({ source: 'manual', payout_rule: { type: 'none' } })).toBe(false);
  expect(isKpiTarget({ source: 'manual', payout_rule: { type: 'none' }, calc: { ...target.calc, tracked: false, source: 'report' } })).toBe(true);
  // Продажу вручную пишем только в цели, которые ведутся вручную.
  expect(isManualTarget({ source: 'manual', calc: { ...target.calc, tracked: false, source: 'manual' } })).toBe(true);
  expect(isManualTarget({ source: 'manual', calc: { ...target.calc, tracked: false, source: 'report' } })).toBe(false);
  expect(isManualTarget(target)).toBe(false);
});
