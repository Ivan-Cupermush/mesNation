import type { FactRule } from './rules';
import { matchesClient, matchesItem, norm } from './text';

/** Разделитель групп в пути товара («ПИВО › Пиво разливное › Драфт Балтика»). */
export const PATH_SEP = ' › ';

/** Строка отчёта о продажах одного менеджера (sales_report_lines). */
export interface ReportLine {
  client_name: string;
  kind: 'total' | 'group' | 'item';
  group_path: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface ClientLists {
  /** Клиенты сети «Есть повод». */
  ep: string[];
  /** Задвоенные клиенты: все с таким названием — одна точка в АКБ. */
  akbMerge: string[];
}

export interface ItemProgress {
  name: string;
  need: number;
  count: number;
  done: boolean;
}

export interface FactResult {
  value: number;
  details: {
    clients?: number;
    items?: ItemProgress[];
    excludedEp?: number;
  };
}

const segmentsOf = (l: Pick<ReportLine, 'group_path' | 'name'>) => [...(l.group_path ? l.group_path.split(PATH_SEP) : []), l.name];

/**
 * Подходит ли строка под выбранные группы: «балтика» — любая группа, в названии
 * которой есть это слово; «ПИВО › … › Драфт Балтика» — именно эта группа.
 */
function groupMatcher(patterns: string[]) {
  const keys = patterns.map((p) => ({ path: p.includes(PATH_SEP.trim()), key: norm(p.split(PATH_SEP.trim()).map((s) => s.trim()).join(PATH_SEP)) }));
  const hit = (segs: string[], isGroup: boolean) =>
    keys.some((p) => (p.path ? norm(segs.join(PATH_SEP)) === p.key : isGroup && norm(segs[segs.length - 1]).includes(p.key)));
  /** Строка учитывается, если подходит она сама, а не группа выше (иначе сумма задвоится). */
  return (l: ReportLine) => {
    if (l.kind === 'total') return false;
    const segs = segmentsOf(l);
    if (!hit(segs, l.kind === 'group')) return false;
    for (let i = 1; i < segs.length; i++) if (hit(segs.slice(0, i), true)) return false;
    return true;
  };
}

/** Факт показателя по строкам отчёта за месяц; null — показатель не считается по отчётам. */
export function computeFact(rule: FactRule, lines: ReportLine[], lists: ClientLists): FactResult | null {
  const epCache = new Map<string, boolean>();
  const isEp = (client: string) => {
    let v = epCache.get(client);
    if (v === undefined) {
      v = lists.ep.some((p) => matchesClient(client, p));
      epCache.set(client, v);
    }
    return v;
  };

  /** Выручка (или штуки) по клиентам: все продажи или только выбранные группы. */
  const revenueByClient = (groups: string[], measure: 'revenue' | 'quantity' = 'revenue') => {
    const out = new Map<string, number>();
    const match = groups.length ? groupMatcher(groups) : (l: ReportLine) => l.kind === 'total';
    for (const l of lines) if (match(l)) out.set(l.client_name, (out.get(l.client_name) ?? 0) + Number(l[measure]));
    return out;
  };

  switch (rule.type) {
    case 'manual':
      return null;
    case 'revenue': {
      let sum = 0;
      let clients = 0;
      for (const [client, rev] of revenueByClient(rule.groups, rule.measure)) {
        const ep = isEp(client);
        if ((rule.clients === 'ep' && !ep) || (rule.clients === 'non_ep' && ep)) continue;
        sum += rev;
        if (rev > 0) clients++;
      }
      return { value: Math.round(sum * 100) / 100, details: { clients } };
    }
    case 'clients': {
      const points = new Set<string>();
      let excludedEp = 0;
      for (const [client, rev] of revenueByClient(rule.groups)) {
        if (!(rev > 0)) continue;
        if (rule.excludeEp && isEp(client)) {
          excludedEp++;
          continue;
        }
        const merged = [...rule.merge, ...lists.akbMerge].find((p) => matchesClient(client, p));
        points.add(merged ? `merge:${norm(merged)}` : norm(client));
      }
      return { value: points.size, details: { clients: points.size, excludedEp } };
    }
    case 'items': {
      const nameCache = new Map<string, boolean>();
      const items: ItemProgress[] = rule.items.map((item) => {
        const clients = new Set<string>();
        for (const l of lines) {
          if (l.kind === 'total' || !(Number(l.quantity) > 0)) continue;
          const key = `${item.name}\u0000${l.name}`;
          let ok = nameCache.get(key);
          if (ok === undefined) {
            ok = matchesItem(item.name, l.name);
            nameCache.set(key, ok);
          }
          if (ok) clients.add(norm(l.client_name));
        }
        return { name: item.name, need: item.need, count: clients.size, done: clients.size >= item.need };
      });
      return { value: items.filter((i) => i.done).length, details: { items } };
    }
  }
}
