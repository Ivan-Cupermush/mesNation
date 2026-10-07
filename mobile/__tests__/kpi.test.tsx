/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import KpiCard from '../src/components/kpi/KpiCard';
import { isKpiTarget, KpiTarget, kpiTitle, money, reportPeriod, shiftMonth } from '../src/services/kpi';

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

test('карточка KPI: факт, прогноз, пороги и подсказка', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<KpiCard target={target} monthEnd="2026-05-31" onMenu={() => {}} />);
  });
  const text = textOf(tree!.toJSON());
  expect(text).toContain('План Балтика');
  expect(text).toContain('Прогноз на 31 мая');
  expect(text).toContain('80%');
  expect(text).toContain('До 80% — ещё 208 100 ₽');
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
});
