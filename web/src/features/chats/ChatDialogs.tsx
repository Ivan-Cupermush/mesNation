import { useState } from 'react';
import { CalendarClock, Pencil, SendHorizonal, Trash2 } from 'lucide-react';
import { api } from '../../lib/http';
import { plural } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { DateTimeDialog, SCHEDULE_PRESETS } from '../../ui/DateTimeDialog';
import { useFeedback } from '../../ui/feedback';
import type { ScheduledMessage } from './types';
import s from './ChatDialogs.module.css';

/** «Удалить сообщение?» как в Telegram: по умолчанию у себя, галочка — у всех. */
export function DeleteDialog({
  count,
  canAll,
  peerName,
  open,
  onClose,
  onDelete,
}: {
  count: number;
  canAll: boolean;
  /** В личном чате — имя собеседника («Также удалить для Ивана»). */
  peerName?: string | null;
  open: boolean;
  onClose: () => void;
  onDelete: (scope: 'me' | 'all') => Promise<void>;
}) {
  const [forAll, setForAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const what = count > 1 ? `${count} ${plural(count, ['сообщение', 'сообщения', 'сообщений'])}` : 'сообщение';
  const run = async () => {
    setBusy(true);
    try {
      await onDelete(canAll && forAll ? 'all' : 'me');
      onClose();
    } catch {
      // ошибку показал вызывающий код; окно остаётся открытым
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent={busy}
      title={`Удалить ${what}?`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="danger" onClick={run} loading={busy}>
            Удалить
          </Button>
        </>
      }
    >
      {canAll ? (
        <label className={s.check}>
          <input type="checkbox" checked={forAll} onChange={(e) => setForAll(e.target.checked)} />
          <span>{peerName ? `Также удалить для ${peerName}` : 'Удалить у всех участников'}</span>
        </label>
      ) : (
        <p className={s.text}>Сообщение исчезнет только у вас.</p>
      )}
    </Modal>
  );
}

/** Мои запланированные сообщения в этом чате: отправить сейчас, перенести, изменить, отменить. */
export function ScheduledList({
  open,
  items,
  onClose,
  onChanged,
}: {
  open: boolean;
  items: ScheduledMessage[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast, confirm, prompt } = useFeedback();
  const [reschedule, setReschedule] = useState<ScheduledMessage | null>(null);

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error(e, fail);
    }
  };

  const edit = async (m: ScheduledMessage) => {
    const text = await prompt({ title: 'Изменить сообщение', initialValue: m.text, multiline: true, required: true, maxLength: 4000, confirmText: 'Сохранить' });
    if (text && text !== m.text) run(() => api.patch(`/api/scheduled/${m.id}`, { text }), 'Не удалось изменить');
  };

  const cancel = async (m: ScheduledMessage) => {
    if (await confirm({ title: 'Отменить отправку?', text: m.text, confirmText: 'Отменить отправку', cancelText: 'Оставить', danger: true })) {
      run(() => api.delete(`/api/scheduled/${m.id}`), 'Не удалось отменить');
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Запланированные сообщения" size="md">
        {items.length === 0 ? (
          <p className={s.text}>Нет запланированных сообщений.</p>
        ) : (
          <div className={s.list}>
            {items.map((m) => (
              <div key={m.id} className={s.row}>
                <div className={s.rowBody}>
                  <div className={s.when}>
                    <CalendarClock size={13} />
                    {new Date(m.send_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className={s.rowText}>{m.text}</div>
                </div>
                <button type="button" className={s.act} title="Отправить сейчас" aria-label="Отправить сейчас" onClick={() => run(() => api.post(`/api/scheduled/${m.id}/send-now`), 'Не удалось отправить')}>
                  <SendHorizonal size={16} />
                </button>
                <button type="button" className={s.act} title="Перенести" aria-label="Перенести" onClick={() => setReschedule(m)}>
                  <CalendarClock size={16} />
                </button>
                <button type="button" className={s.act} title="Изменить текст" aria-label="Изменить текст" onClick={() => edit(m)}>
                  <Pencil size={16} />
                </button>
                <button type="button" className={[s.act, s.danger].join(' ')} title="Отменить" aria-label="Отменить" onClick={() => cancel(m)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className={s.hint}>Чтобы запланировать: напишите текст и нажмите на кнопку отправки правой кнопкой мыши (на телефоне — удерживайте).</p>
      </Modal>
      <DateTimeDialog
        open={!!reschedule}
        title="Перенести отправку"
        initial={reschedule ? new Date(reschedule.send_at) : undefined}
        min={new Date(Date.now() + 60_000)}
        presets={SCHEDULE_PRESETS}
        saveText="Перенести"
        onClose={() => setReschedule(null)}
        onSave={async (d) => {
          try {
            await api.patch(`/api/scheduled/${reschedule!.id}`, { send_at: d.toISOString() });
            onChanged();
          } catch (e) {
            toast.error(e, 'Не удалось перенести');
            throw e;
          }
        }}
      />
    </>
  );
}
