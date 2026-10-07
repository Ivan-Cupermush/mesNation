import { z } from 'zod';
import type { KpiKind, KpiMetric } from './kpiFile';
import { norm } from './text';

/**
 * Как считается факт показателя по отчётам о продажах и сколько за него платить.
 * Правила хранятся у каждой цели (sales_targets.fact_rule / payout_rule):
 * по умолчанию они берутся из названия показателя в файле KPI
 * («порог 90%, при выполнении 80–90% кэф 0,5»), руководитель может их поправить.
 */

const groups = z.array(z.string().trim().min(1).max(300)).max(50);

export const factRuleSchema = z.discriminatedUnion('type', [
  // Факт не из отчётов: вручную или из файла KPI.
  z.object({ type: z.literal('manual') }),
  // Выручка: все продажи или только группы товаров; клиенты — все, только «Есть повод» или без них.
  // measure: quantity — штуки вместо рублей.
  z.object({ type: z.literal('revenue'), groups, clients: z.enum(['all', 'ep', 'non_ep']), measure: z.enum(['revenue', 'quantity']).optional() }),
  // АКБ: число клиентов (точек) с продажами.
  z.object({ type: z.literal('clients'), groups, excludeEp: z.boolean(), merge: z.array(z.string().trim().min(1).max(200)).max(50) }),
  // Дистрибуция: позиции, каждую нужно продать в N точек.
  z.object({
    type: z.literal('items'),
    items: z.array(z.object({ name: z.string().trim().min(1).max(200), need: z.number().int().min(1).max(10000) })).min(1).max(30),
  }),
]);

export const payoutRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  // Оклад, ГСМ — платятся всегда.
  z.object({ type: z.literal('fixed') }),
  // Пороги: от N% плана — бонус × k. Сверх плана — бонус не растёт или растёт пропорционально.
  z.object({
    type: z.literal('threshold'),
    steps: z.array(z.object({ from: z.number().min(0).max(1000), k: z.number().min(0).max(10) })).min(1).max(10),
    over: z.enum(['cap', 'proportional']),
  }),
  // Процент от продаж, если продано не меньше min.
  z.object({ type: z.literal('rate'), rate: z.number().min(0).max(1), min: z.number().min(0) }),
  // Бонус делится поровну между выполненными позициями.
  z.object({ type: z.literal('items') }),
]);

export type FactRule = z.infer<typeof factRuleSchema>;
export type PayoutRule = z.infer<typeof payoutRuleSchema>;

/** Группы товаров по умолчанию. ОПХ — «Объединённые пивоварни Хейнекен». */
const DEFAULT_GROUPS: Partial<Record<KpiKind, string[]>> = {
  baltika: ['балтика'],
  oph: ['heineken', 'хейнекен', 'опх'],
};

const numberIn = (s: string) => Number(s.replace(/[\s ]/g, '').replace(',', '.'));

/** Пороги из названия: «порог 90%, при выполнении 80-90% кэф 0,5» → [90 → 1, 80 → 0,5]. */
export function thresholdsFromName(name: string): { from: number; k: number }[] {
  const s = name.toLowerCase();
  const steps: { from: number; k: number }[] = [];
  const main = s.match(/порог[а-яё]*\s*(\d+(?:[.,]\d+)?)\s*%/);
  if (main) steps.push({ from: numberIn(main[1]), k: 1 });
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*%?\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*%[^,;)]*?(?:кэф|коэф[а-яё]*|кф|к-т)\.?\s*(\d+(?:[.,]\d+)?)/g)) {
    steps.push({ from: numberIn(m[1]), k: numberIn(m[3]) });
  }
  return steps.filter((st) => Number.isFinite(st.from) && Number.isFinite(st.k)).sort((a, b) => b.from - a.from);
}

/** Порог в рублях: «Порог 200 000 руб» → 200000. */
export function amountThresholdFromName(name: string): number {
  const m = name.toLowerCase().match(/порог[а-яё]*\s*([\d\s ]{3,})\s*(?:руб|р\.|₽|т\.?\s*р)/);
  return m ? numberIn(m[1]) : 0;
}

/** Задвоенные клиенты из названия АКБ: «без учета ЕП и задвоенных: Егорова, Морозов и пр» → [Егорова, Морозов]. */
export function mergedClientsFromName(name: string): string[] {
  const m = name.match(/задвоен[а-яё]*\s*:?\s*([^)]*)/i);
  if (!m) return [];
  return m[1]
    .split(/,|\sи\s/)
    .map((w) => w.trim().replace(/\.$/, ''))
    .filter((w) => w.length >= 3 && !/^(пр|др|прочие|другие|т\.?\s*д)$/i.test(w));
}

/** Слова названия показателя, которые не про товар («План продаж …, руб (порог 90%)»). */
const NOT_PRODUCT = new Set([
  'план', 'плана', 'продаж', 'продажи', 'продажа', 'руб', 'рубли', 'рублей', 'тт', 'шт', 'порог', 'выполнение', 'выполнении',
  'при', 'кэф', 'коэф', 'факт', 'бонус', 'сумма', 'объем', 'объём', 'по', 'на', 'в', 'и', 'с', 'без', 'от', 'до', 'за', 'месяц',
  'kpi', 'кпи', 'новых', 'клиентов', 'точек', 'точки', 'количество',
]);

/**
 * Показатель, которого нет среди известных (АКБ, Балтика…): если слово из его
 * названия есть в названии группы товаров отчёта («План Сидр, руб» → «СИДР,
 * МЕДОВУХА»), факт считается по этим группам.
 */
export function guessFactRule(name: string, knownGroups: string[]): FactRule | null {
  const plain = norm(name.replace(/\([^)]*\)/g, ' '));
  const keys = (plain.match(/[a-zа-я0-9]+/g) || []).filter((w) => w.length >= 3 && !NOT_PRODUCT.has(w) && !/^\d+$/.test(w));
  const groupWords = knownGroups.map((g) => norm(g).match(/[a-zа-я0-9]+/g) || []);
  const hits = keys.filter((k) => groupWords.some((ws) => ws.some((w) => w === k || (k.length >= 4 && w.startsWith(k)))));
  if (!hits.length) return null;
  if (/(^|[^а-я])тт([^а-я]|$)|точ/.test(plain)) return { type: 'clients', groups: hits, excludeEp: false, merge: [] };
  return { type: 'revenue', groups: hits, clients: 'all', measure: /(^|[^а-я])шт([^а-я]|$)/.test(plain) ? 'quantity' : 'revenue' };
}

/** Правила по умолчанию для показателя из файла KPI. */
export function defaultRules(
  m: Pick<KpiMetric, 'name' | 'kind' | 'fixed' | 'rate' | 'items'>,
  knownGroups: string[] = [],
): { fact: FactRule; payout: PayoutRule } {
  if (m.fixed) return { fact: { type: 'manual' }, payout: { type: 'fixed' } };
  const steps = thresholdsFromName(m.name);
  const threshold = (over: 'cap' | 'proportional'): PayoutRule => ({
    type: 'threshold',
    steps: steps.length ? steps : [{ from: 100, k: 1 }],
    over,
  });
  const payout: PayoutRule = m.rate != null ? { type: 'rate', rate: m.rate, min: amountThresholdFromName(m.name) } : threshold('proportional');
  switch (m.kind) {
    case 'no_ep':
      return { fact: { type: 'revenue', groups: [], clients: 'non_ep' }, payout };
    case 'ep':
      return { fact: { type: 'revenue', groups: [], clients: 'ep' }, payout };
    case 'baltika':
    case 'oph':
      return { fact: { type: 'revenue', groups: DEFAULT_GROUPS[m.kind]!, clients: 'all' }, payout };
    case 'akb':
      return { fact: { type: 'clients', groups: [], excludeEp: true, merge: mergedClientsFromName(m.name) }, payout: threshold('cap') };
    case 'distra':
      return m.items.length
        ? { fact: { type: 'items', items: m.items.map((i) => ({ name: i.name, need: i.need })) }, payout: { type: 'items' } }
        : { fact: { type: 'manual' }, payout: threshold('cap') };
    default: {
      const fact = guessFactRule(m.name, knownGroups) ?? { type: 'manual' };
      return { fact, payout: m.rate != null || fact.type === 'revenue' ? payout : threshold('cap') };
    }
  }
}

/** Правила цели: сохранённые, иначе — по названию (старые цели «без ЕП» / «есть повод» тоже считаются по отчёту). */
export function effectiveRules(t: {
  product_name: string | null;
  metric_type: string;
  fact_rule?: unknown;
  payout_rule?: unknown;
  kpi_kind?: string | null;
}): { fact: FactRule; payout: PayoutRule } {
  const fact = factRuleSchema.safeParse(t.fact_rule);
  const payout = payoutRuleSchema.safeParse(t.payout_rule);
  if (fact.success && payout.success) return { fact: fact.data, payout: payout.data };
  const name = t.product_name || '';
  const kind = (t.kpi_kind as KpiKind | null) || null;
  const legacy = t.metric_type === 'amount' && (kind === 'no_ep' || kind === 'ep' || /без\s*еп|есть\s*по[вд]од/i.test(norm(name)));
  const base: { fact: FactRule; payout: PayoutRule } = legacy
    ? defaultRules({ name, kind: /без\s*еп/i.test(norm(name)) ? 'no_ep' : 'ep', fixed: false, rate: null, items: [] })
    : { fact: { type: 'manual' }, payout: { type: 'none' } };
  return { fact: fact.success ? fact.data : base.fact, payout: payout.success ? payout.data : base.payout };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Выплата по правилу при данном факте. */
export function payoutFor(rule: PayoutRule, v: { plan: number; fact: number; bonus: number; done?: number; total?: number }): number {
  switch (rule.type) {
    case 'none':
      return 0;
    case 'fixed':
      return round2(v.bonus);
    case 'rate':
      return v.fact >= rule.min ? round2(v.fact * rule.rate) : 0;
    case 'items':
      return v.total ? round2((v.bonus * (v.done ?? 0)) / v.total) : 0;
    case 'threshold': {
      if (!(v.plan > 0)) return 0;
      const pct = (v.fact / v.plan) * 100;
      const steps = [...rule.steps].sort((a, b) => b.from - a.from);
      const step = steps.find((s) => pct >= s.from - 1e-9);
      if (!step) return 0;
      const top = step === steps[0];
      const k = rule.over === 'proportional' && top && pct > 100 ? (step.k * pct) / 100 : step.k;
      return round2(v.bonus * k);
    }
  }
}

/** Максимум выплаты при выполнении плана (для «до … ₽»). */
export function maxPayout(rule: PayoutRule, plan: number, bonus: number): number {
  switch (rule.type) {
    case 'none':
      return 0;
    case 'rate':
      return round2(Math.max(bonus, plan * rule.rate));
    case 'threshold':
      return round2(bonus * Math.max(...rule.steps.map((s) => s.k)));
    default:
      return round2(bonus);
  }
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
/** «12 000 ₽» с неразрывными пробелами. */
export const rub = (n: number) => `${nf.format(Math.round(n)).replace(/\s/g, ' ')} ₽`;
const pct = (n: number) => `${nf2.format(n)}%`;

/** Правило словами — для карточки KPI. */
export function ruleText(rule: PayoutRule, bonus: number, itemsTotal = 0): string {
  switch (rule.type) {
    case 'none':
      return '';
    case 'fixed':
      return 'фиксированная выплата';
    case 'rate':
      return `${pct(rule.rate * 100)} от продаж${rule.min > 0 ? `, если продано от ${rub(rule.min)}` : ''}`;
    case 'items':
      return itemsTotal ? `${rub(bonus)} делится между позициями: по ${rub(bonus / itemsTotal)} за каждую` : `${rub(bonus)} за позиции`;
    case 'threshold': {
      const steps = [...rule.steps].sort((a, b) => b.from - a.from);
      const parts = steps.map((s, i) => {
        const money = s.k === 1 ? rub(bonus) : `${rub(bonus * s.k)} (× ${nf2.format(s.k)})`;
        return i === 0 ? `от ${pct(s.from)} — ${money}` : `${nf2.format(s.from)}–${pct(steps[i - 1].from)} — ${money}`;
      });
      if (rule.over === 'proportional') parts.push('сверх плана — пропорционально');
      return parts.join(', ');
    }
  }
}

/** Отметки порогов на полосе выполнения (в % плана). */
export function ruleMarks(rule: PayoutRule, plan: number): number[] {
  if (rule.type === 'threshold') return rule.steps.map((s) => s.from).filter((f) => f > 0 && f <= 100).sort((a, b) => a - b);
  if (rule.type === 'rate' && rule.min > 0 && plan > 0) return [Math.round((rule.min / plan) * 1000) / 10].filter((m) => m <= 100);
  return [];
}
