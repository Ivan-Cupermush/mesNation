import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { toDateKey } from '../lib/format';
import s from './DateTimeDialog.module.css';

interface Preset {
  label: string;
  at: () => Date;
}

interface Props {
  open: boolean;
  title: string;
  initial?: Date;
  /** Раньше этого момента выбрать нельзя. */
  min?: Date;
  presets?: Preset[];
  saveText?: string;
  onClose: () => void;
  /** Можно вернуть Promise: окно покажет загрузку и закроется само после успеха. */
  onSave: (date: Date) => void | Promise<void>;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const at = (days: number, h: number, m = 0) => () => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d;
};

/** Быстрые варианты, как в Telegram: «через час», «сегодня вечером», «завтра утром». */
export const SCHEDULE_PRESETS: Preset[] = [
  { label: 'Через час', at: () => new Date(Date.now() + 60 * 60_000) },
  { label: 'Сегодня в 18:00', at: at(0, 18) },
  { label: 'Завтра в 9:00', at: at(1, 9) },
  { label: 'Через неделю', at: () => new Date(Date.now() + 7 * 86400_000) },
];

/** Дата и время: отдельные поля дня и часов (нативные пикеры на телефоне) и быстрые варианты. */
export function DateTimeDialog({ open, title, initial, min, presets = [], saveText = 'Готово', onClose, onSave }: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = initial || new Date(Date.now() + 60 * 60_000);
    setDate(toDateKey(d));
    setTime(toTime(d));
  }, [open, initial]);

  const value = date && time ? new Date(`${date}T${time}`) : null;
  const tooEarly = !!(value && min && value.getTime() < min.getTime());
  const invalid = !value || Number.isNaN(value.getTime()) || tooEarly;

  const save = async (d: Date) => {
    setSaving(true);
    try {
      await onSave(d);
      onClose();
    } catch {
      // ошибку показал вызывающий код; окно остаётся открытым
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent={saving}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={() => value && save(value)} disabled={invalid} loading={saving}>
            {saveText}
          </Button>
        </>
      }
    >
      {presets.length > 0 && (
        <div className={s.presets}>
          {presets
            .filter((p) => !min || p.at().getTime() > min.getTime())
            .map((p) => (
              <button key={p.label} type="button" className={s.preset} onClick={() => save(p.at())} disabled={saving}>
                {p.label}
              </button>
            ))}
        </div>
      )}
      <div className={s.fields}>
        <label className={s.field}>
          <span>Дата</span>
          <input type="date" value={date} min={min ? toDateKey(min) : undefined} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={s.field}>
          <span>Время</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      {tooEarly && <div className={s.error}>Это время уже прошло</div>}
      {value && !invalid && (
        <div className={s.summary}>
          {value.toLocaleString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </Modal>
  );
}
