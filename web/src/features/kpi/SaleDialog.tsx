import { useMemo, useState } from 'react';
import { api } from '../../lib/http';
import { Button } from '../../ui/Button';
import { TextArea, TextField } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { useFeedback } from '../../ui/feedback';
import { isoDay, metricValue } from './format';
import { useKpiRefresh } from './queries';
import { parseNumber } from './TargetDialog';
import type { SalesTarget } from './types';
import s from './kpi.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Мои действующие цели: продажу можно засчитать в одну из них. */
  targets: SalesTarget[];
  /** Цель, из карточки которой открыли форму. */
  preset?: SalesTarget | null;
  suggestions?: string[];
}

/**
 * Записать продажу вручную (без Excel). Если выбрать цель, её выполнение
 * вырастет на количество (для штук и контрактов) или на сумму (для рублей).
 */
export function SaleDialog({ open, onClose, targets, preset, suggestions = [] }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Записать продажу" size="md">
      {open && <SaleForm key={preset?.id ?? 'new'} targets={targets.filter((t) => t.metric_type !== 'boolean')} preset={preset ?? null} suggestions={suggestions} onDone={onClose} />}
    </Modal>
  );
}

function SaleForm({ targets, preset, suggestions, onDone }: { targets: SalesTarget[]; preset: SalesTarget | null; suggestions: string[]; onDone: () => void }) {
  const { toast } = useFeedback();
  const refresh = useKpiRefresh();
  const [product, setProduct] = useState(preset?.product_name || '');
  const [targetId, setTargetId] = useState<number | null>(preset?.id ?? null);
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => isoDay(new Date()));
  const [client, setClient] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const target = targets.find((t) => t.id === targetId) ?? null;

  const names = useMemo(() => [...new Set([...targets.map((t) => t.product_name || ''), ...suggestions].filter(Boolean))], [targets, suggestions]);

  // Название совпало с целью — предлагаем засчитать продажу в неё.
  const onProduct = (v: string) => {
    setProduct(v);
    if (targetId == null) {
      const match = targets.find((t) => (t.product_name || '').trim().toLowerCase() === v.trim().toLowerCase());
      if (match) setTargetId(match.id);
    }
  };

  const qty = parseNumber(quantity);
  const sum = amount.trim() ? parseNumber(amount) : 0;
  const increment = target ? (target.metric_type === 'amount' ? sum : qty) : 0;

  const save = async () => {
    const e: Record<string, string> = {};
    if (!product.trim()) e.product = 'Введите товар или услугу';
    if (!(qty > 0)) e.quantity = 'Больше нуля';
    if (!(sum >= 0)) e.amount = 'Не меньше нуля';
    if (!date || date > isoDay(new Date())) e.date = 'Дата продажи не может быть в будущем';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await api.post('/api/kpi/sales/transactions', {
        product_name: product.trim(),
        quantity: qty,
        amount: sum,
        transaction_date: date,
        client_name: client.trim() || undefined,
        notes: notes.trim() || undefined,
        target_id: targetId ?? undefined,
      });
      refresh();
      toast.success(target ? `Продажа записана, цель «${target.product_name}» обновлена` : 'Продажа записана');
      onDone();
    } catch (err) {
      toast.error(err, 'Не удалось записать продажу');
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
      <TextField label="Товар или услуга" value={product} onChange={(e) => onProduct(e.target.value)} list="kpi-sale-products" maxLength={255} error={errors.product} autoFocus={!preset} />
      <datalist id="kpi-sale-products">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className={s.formRow}>
        <TextField label="Количество" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" error={errors.quantity} autoFocus={!!preset} />
        <TextField label="Сумма, ₽" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" error={errors.amount} />
      </div>
      <div className={s.formRow}>
        <TextField label="Дата" type="date" value={date} max={isoDay(new Date())} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <TextField label="Клиент" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Необязательно" maxLength={255} />
      </div>
      {targets.length > 0 && (
        <label className={s.formField}>
          <span className={s.formLabel}>Засчитать в цель</span>
          <select className={s.select} value={targetId ?? ''} onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Не засчитывать</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.product_name || 'Цель'} — {metricValue(t.metric_type, t.current_value)} из {metricValue(t.metric_type, t.target_value)}
              </option>
            ))}
          </select>
          {target && increment > 0 && (
            <span className={s.formHint}>
              Выполнение вырастет на {metricValue(target.metric_type, increment)}
            </span>
          )}
        </label>
      )}
      <TextArea label="Комментарий" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Необязательно" maxLength={2000} maxRows={5} />
      <Button type="submit" loading={saving} block>
        Записать
      </Button>
    </form>
  );
}
