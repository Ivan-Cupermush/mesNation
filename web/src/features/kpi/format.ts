import type { MetricType, Period, SalesTarget } from './types';

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'quarter', label: 'Квартал' },
];

export const PERIOD_HINT: Record<Period, string> = {
  week: 'за последние 7 дней',
  month: 'с начала месяца',
  quarter: 'с начала квартала',
};

/** Типы показателя, которые можно выбрать в форме (как в приложении). */
export const METRICS: { key: Exclude<MetricType, 'boolean'>; label: string; unit: string }[] = [
  { key: 'quantity', label: 'Штуки', unit: 'шт' },
  { key: 'amount', label: 'Рубли', unit: '₽' },
  { key: 'contracts', label: 'Контракты', unit: 'контр.' },
];

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export const toNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 1 234 567 ₽ */
export const money = (v: unknown) => `${nf0.format(Math.round(toNum(v)))}\u00a0₽`;
/** Короткая запись для графиков: 1,2 млн ₽, 350 тыс ₽. */
export const moneyShort = (v: unknown) => {
  const n = toNum(v);
  if (Math.abs(n) >= 1_000_000) return `${nf.format(Math.round(n / 100_000) / 10)} млн ₽`;
  if (Math.abs(n) >= 10_000) return `${nf0.format(Math.round(n / 1000))} тыс ₽`;
  return money(n);
};
export const number = (v: unknown) => nf.format(toNum(v));

export const metricLabel = (m: MetricType) =>
  m === 'amount' ? 'Сумма, ₽' : m === 'contracts' ? 'Контракты' : m === 'boolean' ? 'Да / нет' : 'Количество, шт';
/** Короткая подпись для карточки цели. */
export const metricShort = (m: MetricType) => (m === 'amount' ? 'Рубли' : m === 'contracts' ? 'Контракты' : m === 'boolean' ? 'Да / нет' : 'Штуки');

/** Значение показателя с единицей: «12 шт», «150 000 ₽», «Да». */
export function metricValue(m: MetricType, v: unknown): string {
  if (m === 'amount') return money(v);
  if (m === 'boolean') return toNum(v) >= 1 ? 'Да' : 'Нет';
  if (m === 'contracts') return `${number(v)} контр.`;
  return `${number(v)} шт`;
}

/** Процент выполнения (без ограничения сверху — перевыполнение видно). */
export function progressOf(t: Pick<SalesTarget, 'current_value' | 'target_value' | 'progress_percent'>): number {
  const p = t.progress_percent != null ? toNum(t.progress_percent) : (toNum(t.current_value) / Math.max(toNum(t.target_value), 1)) * 100;
  return Math.max(0, Math.round(p));
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/** «1–31 окт.» в пределах месяца, иначе «5 окт. – 4 нояб.». */
export function periodLabel(t: Pick<SalesTarget, 'period_start' | 'period_end'>): string {
  const a = new Date(t.period_start);
  const b = new Date(t.period_end);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
  }
  return `${shortDate(t.period_start)} – ${shortDate(t.period_end)}`;
}

/**
 * Что может зритель с целью — повторяет правила сервера (targetAccess):
 * прогресс ведут владелец и его руководители; план, назначенный
 * руководителем, сотрудник не меняет и не удаляет.
 */
export function targetRights(t: Pick<SalesTarget, 'user_id' | 'created_by'>, viewerId: number, viewerIsManager: boolean) {
  const isOwner = t.user_id === viewerId;
  const assignedByOther = t.created_by != null && t.created_by !== t.user_id;
  return {
    canProgress: isOwner || viewerIsManager,
    canEditPlan: viewerIsManager || t.created_by === viewerId || (isOwner && !assignedByOther),
    assignedByOther,
  };
}

/** Дата YYYY-MM-DD в местном времени (для полей type=date). */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- Месяцы KPI ----------

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «2026-05» для даты (по умолчанию — текущий месяц). */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** «2026-05» → «май 2026». */
export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1] ?? ''} ${y}`;
}

/** Соседний месяц: shiftMonth('2026-01', -1) → '2025-12'. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/** «2026-05-15» → «15 мая». */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_GEN[m - 1] ?? ''}`;
}

/** Период отчёта: «15 мая», «1–15 мая». */
export function reportPeriod(start: string, end: string): string {
  if (start === end) return dayMonth(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))}–${dayMonth(end)}`;
  return `${dayMonth(start)} – ${dayMonth(end)}`;
}

/** Значение показателя KPI с его единицей (ТТ, позиции, ₽). */
export function kpiValue(t: { metric_type: MetricType; unit?: string | null }, v: unknown): string {
  if (t.unit && t.metric_type !== 'amount') return `${number(v)} ${t.unit}`;
  return metricValue(t.metric_type, v);
}
