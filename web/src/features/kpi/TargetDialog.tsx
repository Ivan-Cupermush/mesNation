import { useState } from 'react';
import { ChevronRight, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import { api } from '../../lib/http';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Chips, Segmented, TextArea, TextField } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import type { MenuItem } from '../../ui/ActionMenu';
import { useFeedback } from '../../ui/feedback';
import { METRICS, isoDay, metricLabel, metricValue, targetRights } from './format';
import { useKpiRefresh } from './queries';
import { TeamPicker } from './TeamPicker';
import type { MetricType, SalesTarget } from './types';
import s from './kpi.module.css';

export type TargetMode =
  | { kind: 'own' }
  | { kind: 'assign'; user?: { id: number; name: string } }
  | { kind: 'edit'; target: SalesTarget; canEditPlan: boolean };

/** «1 234,5» → 1234.5; пусто или мусор → NaN. */
export function parseNumber(v: string): number {
  const str = v.replace(/[\s ₽]/g, '').replace(',', '.');
  if (!str) return NaN;
  const n = Number(str);
  return Number.isFinite(n) ? n : NaN;
}

type Span = '30d' | 'month' | 'quarter' | 'custom';

function spanDates(span: Exclude<Span, 'custom'>): [string, string] {
  const now = new Date();
  if (span === 'month') return [isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  if (span === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) * 3;
    return [isoDay(new Date(now.getFullYear(), q, 1)), isoDay(new Date(now.getFullYear(), q + 3, 0))];
  }
  // Как по умолчанию на сервере и в приложении: 30 дней с сегодняшнего.
  return [isoDay(now), isoDay(new Date(now.getTime() + 30 * 86_400_000))];
}

interface DialogProps {
  mode: TargetMode | null;
  onClose: () => void;
  /** Подсказки названий: товары из целей и продаж. */
  suggestions?: string[];
}

/** Новый свой KPI, KPI сотруднику или правка цели — одна форма, как в приложении. */
export function TargetDialog({ mode, onClose, suggestions = [] }: DialogProps) {
  const title = !mode ? '' : mode.kind === 'own' ? 'Новый KPI' : mode.kind === 'assign' ? 'Назначить KPI' : 'Изменить цель';
  return (
    <Modal open={!!mode} onClose={onClose} title={title} size="md">
      {mode && <TargetForm key={mode.kind === 'edit' ? `e${mode.target.id}` : mode.kind} mode={mode} onDone={onClose} suggestions={suggestions} />}
    </Modal>
  );
}

function TargetForm({ mode, onDone, suggestions }: { mode: TargetMode; onDone: () => void; suggestions: string[] }) {
  const { toast } = useFeedback();
  const refresh = useKpiRefresh();
  const edit = mode.kind === 'edit' ? mode.target : null;
  const [product, setProduct] = useState(edit?.product_name || '');
  const [metric, setMetric] = useState<MetricType>(edit?.metric_type || 'quantity');
  const [target, setTarget] = useState(edit ? String(Number(edit.target_value)) : '');
  const [current, setCurrent] = useState(edit ? String(Number(edit.current_value)) : '');
  const [description, setDescription] = useState(edit?.description || '');
  const [span, setSpan] = useState<Span>('30d');
  const [[start, end], setDates] = useState<[string, string]>(() => spanDates('30d'));
  const [user, setUser] = useState<{ id: number; name: string } | null>(mode.kind === 'assign' ? mode.user ?? null : null);
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const canEditPlan = mode.kind !== 'edit' || mode.canEditPlan;
  const unit = METRICS.find((m) => m.key === metric)?.unit;

  const validate = () => {
    const e: Record<string, string> = {};
    if (mode.kind === 'assign' && !user) e.user = 'Выберите сотрудника';
    if (!edit && !product.trim()) e.product = 'Введите название товара или услуги';
    const t = parseNumber(target);
    if (canEditPlan && !(t > 0)) e.target = 'Цель — число больше нуля';
    const c = current.trim() ? parseNumber(current) : 0;
    if (!(c >= 0)) e.current = 'Число не меньше нуля';
    if (!edit && (!start || !end || start > end)) e.period = 'Начало периода не может быть позже конца';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const c = current.trim() ? parseNumber(current) : 0;
      if (edit) {
        const patch: Record<string, unknown> = {};
        if (c !== Number(edit.current_value)) patch.current_value = c;
        if (canEditPlan && parseNumber(target) !== Number(edit.target_value)) patch.target_value = parseNumber(target);
        if (canEditPlan && description.trim() !== (edit.description || '').trim()) patch.description = description.trim() || null;
        if (Object.keys(patch).length) await api.patch(`/api/kpi/sales/targets/${edit.id}`, patch);
        toast.success('Сохранено');
      } else {
        const body = {
          product_name: product.trim(),
          metric_type: metric,
          target_value: parseNumber(target),
          current_value: c,
          period_start: start,
          period_end: end,
          description: description.trim() || undefined,
        };
        if (mode.kind === 'assign') {
          await api.post('/api/kpi/sales/targets/assign', { ...body, user_id: user!.id });
          toast.success(`KPI назначен: ${user!.name}`);
        } else {
          await api.post('/api/kpi/sales/targets', body);
          toast.success('Цель добавлена');
        }
      }
      refresh();
      onDone();
    } catch (e) {
      toast.error(e, 'Не удалось сохранить цель');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {mode.kind === 'assign' && (
        <div className={s.formField}>
          <span className={s.formLabel}>Сотрудник</span>
          {mode.user ? (
            <div className={s.personFixed}>
              <Avatar name={mode.user.name} size={32} />
              <b>{mode.user.name}</b>
            </div>
          ) : (
            <button type="button" className={[s.personPick, errors.user && s.invalid].filter(Boolean).join(' ')} onClick={() => setPicking(true)}>
              {user ? (
                <>
                  <Avatar name={user.name} size={32} />
                  <b>{user.name}</b>
                </>
              ) : (
                <span className={s.placeholder}>Выберите из своей команды</span>
              )}
              <ChevronRight size={18} />
            </button>
          )}
          {errors.user && <span className={s.formError}>{errors.user}</span>}
        </div>
      )}

      {edit ? (
        <div className={s.editHead}>
          <b>{edit.product_name || 'Цель'}</b>
          <span>{metricLabel(edit.metric_type)}</span>
        </div>
      ) : (
        <>
          <TextField
            label="Товар или услуга"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="Например: Премиум пакет"
            maxLength={255}
            error={errors.product}
            list="kpi-products"
            autoFocus={mode.kind === 'own' || !!user}
          />
          <datalist id="kpi-products">
            {suggestions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className={s.formField}>
            <span className={s.formLabel}>Что считаем</span>
            <Segmented options={METRICS.map((m) => ({ key: m.key, label: m.label }))} value={metric as (typeof METRICS)[number]['key']} onChange={setMetric} />
          </div>
        </>
      )}

      <div className={s.formRow}>
        <TextField
          label={`Цель${unit ? `, ${unit}` : ''}`}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          inputMode="decimal"
          placeholder="50"
          error={errors.target}
          disabled={!canEditPlan}
          hint={!canEditPlan ? 'План назначил руководитель' : undefined}
        />
        <TextField
          label={edit ? `Выполнено${unit ? `, ${unit}` : ''}` : 'Уже выполнено'}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          error={errors.current}
          autoFocus={!!edit && !canEditPlan}
        />
      </div>

      {!edit && (
        <div className={s.formField}>
          <span className={s.formLabel}>Период</span>
          <Chips
            value={span}
            onChange={(v) => {
              setSpan(v);
              if (v !== 'custom') setDates(spanDates(v));
            }}
            options={[
              { key: '30d', label: '30 дней' },
              { key: 'month', label: 'Этот месяц' },
              { key: 'quarter', label: 'Квартал' },
              { key: 'custom', label: 'Свой' },
            ]}
          />
          <div className={s.formRow}>
            <TextField
              type="date"
              aria-label="Начало периода"
              value={start}
              onChange={(e) => {
                setSpan('custom');
                setDates([e.target.value, end]);
              }}
            />
            <TextField
              type="date"
              aria-label="Конец периода"
              value={end}
              min={start}
              onChange={(e) => {
                setSpan('custom');
                setDates([start, e.target.value]);
              }}
            />
          </div>
          {errors.period && <span className={s.formError}>{errors.period}</span>}
        </div>
      )}

      <TextArea
        label="Описание"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Необязательно: условия, комментарий"
        maxLength={2000}
        maxRows={6}
        disabled={!canEditPlan}
      />

      <Button type="submit" loading={saving} block>
        {edit ? 'Сохранить' : mode.kind === 'assign' ? 'Назначить' : 'Добавить цель'}
      </Button>

      {mode.kind === 'assign' && !mode.user && (
        <TeamPicker
          open={picking}
          title="Кому назначить"
          onClose={() => setPicking(false)}
          onPick={(u) => {
            setUser(u);
            setPicking(false);
            setErrors((e) => ({ ...e, user: '' }));
          }}
        />
      )}
    </form>
  );
}

/**
 * Действия с целями: меню «⋯» у карточки и диалоги. Права — как на сервере.
 * viewerIsManager — смотрит руководитель сотрудника (карточка сотрудника).
 */
export function useTargetActions({ viewerId, viewerIsManager, onSale }: { viewerId: number; viewerIsManager: boolean; onSale?: (t: SalesTarget) => void }) {
  const { confirm, toast } = useFeedback();
  const refresh = useKpiRefresh();
  const [mode, setMode] = useState<TargetMode | null>(null);

  const remove = async (t: SalesTarget) => {
    const ok = await confirm({
      title: `Удалить цель «${t.product_name || 'Цель'}»?`,
      text: `Выполнено ${metricValue(t.metric_type, t.current_value)} из ${metricValue(t.metric_type, t.target_value)}. Продажи останутся в истории.`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/kpi/sales/targets/${t.id}`);
      refresh();
      toast.success('Цель удалена');
    } catch (e) {
      toast.error(e, 'Не удалось удалить цель');
    }
  };

  const itemsFor = (t: SalesTarget): MenuItem[] => {
    const r = targetRights(t, viewerId, viewerIsManager);
    const items: MenuItem[] = [];
    if (r.canProgress) {
      items.push({
        key: 'edit',
        label: r.canEditPlan ? 'Изменить' : 'Обновить выполнение',
        icon: <Pencil size={18} />,
        onSelect: () => setMode({ kind: 'edit', target: t, canEditPlan: r.canEditPlan }),
      });
    }
    if (onSale && t.user_id === viewerId && t.metric_type !== 'boolean') {
      items.push({ key: 'sale', label: 'Записать продажу', icon: <ShoppingCart size={18} />, onSelect: () => onSale(t) });
    }
    if (r.canEditPlan) items.push({ key: 'delete', label: 'Удалить', icon: <Trash2 size={18} />, danger: true, onSelect: () => remove(t) });
    return items;
  };

  return { mode, setMode, itemsFor };
}
