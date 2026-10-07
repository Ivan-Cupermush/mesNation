import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { api } from '../../lib/http';
import { fuzzyMatch } from '../../lib/fuzzy';
import { Button, IconButton } from '../../ui/Button';
import { Chips, SearchField, Segmented, Switch, TextArea, TextField } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { useFeedback } from '../../ui/feedback';
import { moneyShort, toNum } from './format';
import { kpiTitle } from './KpiCard';
import { useKpiRefresh, useReportGroups } from './queries';
import { parseNumber } from './TargetDialog';
import type { FactRule, KpiTarget, PayoutRule } from './types';
import s from './kpiMonth.module.css';

type FactType = FactRule['type'];
type PayType = PayoutRule['type'];

const FACT_TYPES: { key: FactType; label: string }[] = [
  { key: 'revenue', label: 'Продажи' },
  { key: 'clients', label: 'Точки' },
  { key: 'items', label: 'Позиции' },
  { key: 'manual', label: 'Вручную' },
];
const PAY_TYPES: { key: PayType; label: string }[] = [
  { key: 'threshold', label: 'Пороги' },
  { key: 'rate', label: '% от продаж' },
  { key: 'items', label: 'За позиции' },
  { key: 'fixed', label: 'Фикс' },
  { key: 'none', label: 'Нет' },
];

const str = (n: number) => String(n).replace('.', ',');

/**
 * Правило показателя: как считать факт по отчётам о продажах и сколько платить.
 * По умолчанию правило берётся из названия показателя в файле KPI; здесь его
 * можно поправить (например, когда заказчик уточнил пороги).
 */
export function RuleDialog({ target, month, onClose }: { target: KpiTarget | null; month: string; onClose: () => void }) {
  return (
    <Modal open={!!target} onClose={onClose} title="Правило расчёта" size="md">
      {target && <RuleForm key={target.id} target={target} month={month} onDone={onClose} />}
    </Modal>
  );
}

function RuleForm({ target: t, month, onDone }: { target: KpiTarget; month: string; onDone: () => void }) {
  const { toast } = useFeedback();
  const refresh = useKpiRefresh();
  const f = t.fact_rule;
  const p = t.payout_rule;
  const [factType, setFactType] = useState<FactType>(f.type);
  const [groups, setGroups] = useState<string[]>(f.type === 'revenue' || f.type === 'clients' ? f.groups : []);
  const [clients, setClients] = useState<'all' | 'ep' | 'non_ep'>(f.type === 'revenue' ? f.clients : 'all');
  const [measure, setMeasure] = useState<'revenue' | 'quantity'>(f.type === 'revenue' ? f.measure ?? 'revenue' : 'revenue');
  const [excludeEp, setExcludeEp] = useState(f.type === 'clients' ? f.excludeEp : true);
  const [merge, setMerge] = useState(f.type === 'clients' ? f.merge.join('\n') : '');
  const [items, setItems] = useState(f.type === 'items' ? f.items.map((i) => ({ name: i.name, need: String(i.need) })) : [{ name: '', need: '1' }]);
  const [payType, setPayType] = useState<PayType>(p.type);
  const [bonus, setBonus] = useState(str(toNum(t.bonus_amount)));
  const [steps, setSteps] = useState(p.type === 'threshold' ? p.steps.map((x) => ({ from: str(x.from), k: str(x.k) })) : [{ from: '100', k: '1' }]);
  const [over, setOver] = useState(p.type === 'threshold' ? p.over === 'proportional' : false);
  const [rate, setRate] = useState(p.type === 'rate' ? str(Math.round(p.rate * 10000) / 100) : '');
  const [min, setMin] = useState(p.type === 'rate' ? str(p.min) : '0');
  const [keyword, setKeyword] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const byGroups = factType === 'revenue' || factType === 'clients';
  const reportGroups = useReportGroups(month, byGroups);
  const shown = useMemo(() => (reportGroups.data ?? []).filter((g) => !q.trim() || fuzzyMatch(g.path, q).match).slice(0, 200), [reportGroups.data, q]);

  const toggle = (path: string) => setGroups((gs) => (gs.includes(path) ? gs.filter((g) => g !== path) : [...gs, path]));

  const build = (): { fact: FactRule; payout: PayoutRule; bonus: number } | string => {
    let fact: FactRule;
    if (factType === 'revenue') fact = { type: 'revenue', groups, clients, measure };
    else if (factType === 'clients') fact = { type: 'clients', groups, excludeEp, merge: merge.split('\n').map((x) => x.trim()).filter(Boolean) };
    else if (factType === 'items') {
      const list = items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), need: Math.round(parseNumber(i.need)) }));
      if (!list.length) return 'Добавьте хотя бы одну позицию';
      if (list.some((i) => !(i.need >= 1))) return 'Число точек у позиции — от 1';
      fact = { type: 'items', items: list };
    } else fact = { type: 'manual' };

    const b = parseNumber(bonus || '0');
    if (!(b >= 0)) return 'Бонус — число не меньше 0';
    let payout: PayoutRule;
    if (payType === 'threshold') {
      const list = steps.map((x) => ({ from: parseNumber(x.from), k: parseNumber(x.k) }));
      if (!list.length || list.some((x) => !(x.from >= 0) || !(x.k >= 0))) return 'Пороги: процент и коэффициент — числа';
      payout = { type: 'threshold', steps: list.sort((a, c) => c.from - a.from), over: over ? 'proportional' : 'cap' };
    } else if (payType === 'rate') {
      const r = parseNumber(rate);
      const m = parseNumber(min || '0');
      if (!(r > 0 && r <= 100)) return 'Процент от продаж — от 0 до 100';
      if (!(m >= 0)) return 'Порог продаж — число не меньше 0';
      payout = { type: 'rate', rate: r / 100, min: m };
    } else if (payType === 'items') payout = { type: 'items' };
    else if (payType === 'fixed') payout = { type: 'fixed' };
    else payout = { type: 'none' };
    return { fact, payout, bonus: b };
  };

  const save = async () => {
    const r = build();
    if (typeof r === 'string') {
      setError(r);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.patch(`/api/kpi/sales/targets/${t.id}`, { fact_rule: r.fact, payout_rule: r.payout, bonus_amount: r.bonus });
      refresh();
      toast.success('Правило сохранено, KPI пересчитан');
      onDone();
    } catch (e) {
      toast.error(e, 'Не удалось сохранить правило');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={s.ruleForm}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className={s.ruleTarget} title={t.product_name || undefined}>
        {kpiTitle(t)}
        <span>{t.product_name}</span>
      </p>

      <fieldset className={s.ruleSection}>
        <legend>Как считать факт</legend>
        <Segmented options={FACT_TYPES} value={factType} onChange={setFactType} />
        {factType === 'revenue' && (
          <>
            <Chips
              options={[
                { key: 'all', label: 'Все клиенты' },
                { key: 'non_ep', label: 'Без «Есть повод»' },
                { key: 'ep', label: 'Только «Есть повод»' },
              ]}
              value={clients}
              onChange={setClients}
            />
            <Chips
              options={[
                { key: 'revenue', label: 'Выручка, ₽' },
                { key: 'quantity', label: 'Количество, шт' },
              ]}
              value={measure}
              onChange={setMeasure}
            />
          </>
        )}
        {factType === 'clients' && (
          <>
            <label className={s.switchRow}>
              <span>Не считать точки «Есть повод»</span>
              <Switch checked={excludeEp} onChange={setExcludeEp} label="Не считать точки «Есть повод»" />
            </label>
            <TextArea
              label="Задвоенные клиенты — считаются одной точкой"
              hint="По одному на строку: часть названия, например «Егорова»"
              value={merge}
              onChange={(e) => setMerge(e.target.value)}
              maxRows={5}
            />
          </>
        )}
        {byGroups && (
          <div className={s.groups}>
            <span className={s.groupsLabel}>{groups.length ? 'Только эти группы товаров' : 'Все товары (группы не выбраны)'}</span>
            {groups.length > 0 && (
              <div className={s.tags}>
                {groups.map((g) => (
                  <span key={g} className={s.tag}>
                    {g.split(' › ').pop()}
                    <button type="button" aria-label={`Убрать «${g}»`} onClick={() => toggle(g)}>
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={s.keyword}>
              <TextField
                placeholder="Слово из названия группы, например «Балтика»"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && keyword.trim()) {
                    e.preventDefault();
                    if (!groups.includes(keyword.trim())) setGroups([...groups, keyword.trim()]);
                    setKeyword('');
                  }
                }}
              />
              <Button
                size="sm"
                variant="soft"
                icon={<Plus size={16} />}
                disabled={!keyword.trim()}
                onClick={() => {
                  if (!groups.includes(keyword.trim())) setGroups([...groups, keyword.trim()]);
                  setKeyword('');
                }}
              >
                Слово
              </Button>
            </div>
            {(reportGroups.data?.length ?? 0) > 0 ? (
              <>
                <SearchField value={q} onChange={setQ} placeholder="Группы из отчётов за месяц" />
                <div className={s.groupList}>
                  {shown.map((g) => (
                    <label key={g.path} className={s.groupRow} style={{ paddingLeft: 10 + (g.depth - 1) * 14 }}>
                      <input type="checkbox" checked={groups.includes(g.path)} onChange={() => toggle(g.path)} />
                      <span>{g.name}</span>
                      <small>{moneyShort(g.revenue)}</small>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className={s.muted}>Группы товаров появятся здесь после загрузки отчёта о продажах за этот месяц.</p>
            )}
          </div>
        )}
        {factType === 'items' && (
          <div className={s.rows}>
            {items.map((it, i) => (
              <div key={i} className={s.ruleRow}>
                <TextField
                  placeholder="Товар, например «Балтика Стаут кег»"
                  value={it.name}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <TextField
                  className={s.narrow}
                  inputMode="numeric"
                  aria-label="Точек"
                  value={it.need}
                  right={<span className={s.unit}>ТТ</span>}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, need: e.target.value } : x)))}
                />
                <IconButton label="Убрать позицию" size={36} onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => setItems([...items, { name: '', need: '1' }])}>
              Позиция
            </Button>
            <p className={s.muted}>Позиция выполнена, когда её купили столько разных точек. Названия сравниваются нечётко: «Стаут» = «Stout».</p>
          </div>
        )}
        {factType === 'manual' && <p className={s.muted}>Факт не берётся из отчётов — его вносят вручную или он приходит из файла KPI.</p>}
      </fieldset>

      <fieldset className={s.ruleSection}>
        <legend>Выплата</legend>
        <Segmented options={PAY_TYPES} value={payType} onChange={setPayType} />
        {(payType === 'threshold' || payType === 'items' || payType === 'fixed') && (
          <TextField
            label={payType === 'fixed' ? 'Сумма' : 'Бонус при выполнении плана'}
            inputMode="decimal"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            right={<span className={s.unit}>₽</span>}
          />
        )}
        {payType === 'threshold' && (
          <div className={s.rows}>
            {steps.map((st, i) => (
              <div key={i} className={s.ruleRow}>
                <span className={s.rowText}>от</span>
                <TextField
                  className={s.narrow}
                  aria-label="Выполнение плана, %"
                  inputMode="decimal"
                  value={st.from}
                  right={<span className={s.unit}>%</span>}
                  onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                />
                <span className={s.rowText}>бонус ×</span>
                <TextField
                  className={s.narrow}
                  aria-label="Коэффициент"
                  inputMode="decimal"
                  value={st.k}
                  onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))}
                />
                <IconButton label="Убрать порог" size={36} onClick={() => setSteps(steps.filter((_, j) => j !== i))} disabled={steps.length === 1}>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => setSteps([...steps, { from: '80', k: '0,5' }])}>
              Порог
            </Button>
            <label className={s.switchRow}>
              <span>Сверх плана — бонус растёт пропорционально</span>
              <Switch checked={over} onChange={setOver} label="Сверх плана — пропорционально" />
            </label>
          </div>
        )}
        {payType === 'rate' && (
          <div className={s.ruleRow}>
            <TextField label="Процент от продаж" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} right={<span className={s.unit}>%</span>} />
            <TextField label="Если продано от" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} right={<span className={s.unit}>₽</span>} />
          </div>
        )}
        {payType === 'items' && <p className={s.muted}>Бонус делится поровну между позициями: платится за каждую выполненную.</p>}
      </fieldset>

      {error && <p className={s.error}>{error}</p>}
      <Button type="submit" loading={saving} block>
        Сохранить и пересчитать
      </Button>
    </form>
  );
}
