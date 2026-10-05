import { useState } from 'react';
import { api, setToken } from '../../lib/http';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { TextField } from '../../ui/Field';
import { useFeedback } from '../../ui/feedback';

/**
 * Смена пароля. Сервер завершает остальные сессии и выдаёт новый токен —
 * на этом устройстве вход сохраняется, на других придётся войти заново.
 */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setCurrent('');
    setNext('');
    setRepeat('');
    setError(null);
    onClose();
  };

  const mismatch = !!repeat && next !== repeat;
  const tooShort = !!next && next.length < 8;

  const save = async () => {
    if (!current || next.length < 8 || next !== repeat) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ token: string }>('/api/auth/change-password', { current_password: current, new_password: next });
      if (r.token) setToken(r.token);
      toast.success('Пароль изменён. На других устройствах нужно войти заново.');
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сменить пароль');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      persistent={saving}
      title="Смена пароля"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={save} loading={saving} disabled={!current || next.length < 8 || next !== repeat}>
            Сменить пароль
          </Button>
        </>
      }
    >
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <TextField label="Текущий пароль" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus error={error} />
        <TextField
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={tooShort ? 'Не короче 8 символов' : null}
          hint="Не короче 8 символов. Длинная фраза надёжнее короткого пароля со спецсимволами."
        />
        <TextField label="Повторите новый пароль" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} error={mismatch ? 'Пароли не совпадают' : null} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
