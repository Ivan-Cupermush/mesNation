import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Camera, ChevronLeft, Layers, Users } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api, uploadFile } from '../../lib/http';
import { plural } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import { Switch, TextField } from '../../ui/Field';
import { useFeedback } from '../../ui/feedback';
import { UserPicker } from '../users/UserPicker';
import { chatKeys } from './queries';
import type { Chat } from './types';
import type { Employee } from '../../lib/types';
import s from './CreateChat.module.css';

type Step = 'contacts' | 'members' | 'details';

/**
 * Новый чат — как в приложении: выбор собеседника (личный чат) или
 * «Новая группа» / «Группа с темами»: участники → название и фото.
 */
export default function CreateChat() {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>(params.get('mode') === 'group' ? 'members' : 'contacts');
  const [withTopics, setWithTopics] = useState(params.get('topics') === '1');
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const openPrivate = async (u: Employee) => {
    setBusy(true);
    try {
      const chat = await api.post<Chat>('/api/chats', { type: 'private', user_ids: [u.id] });
      await qc.invalidateQueries({ queryKey: chatKeys.list });
      navigate(`/chats/${chat.id}`, { replace: true });
    } catch (e) {
      toast.error(e, 'Не удалось открыть чат');
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!name.trim()) {
      toast('Введите название группы');
      return;
    }
    setBusy(true);
    try {
      const chat = await api.post<Chat>('/api/chats', { type: 'group', name: name.trim(), user_ids: selected, is_supergroup: withTopics });
      if (photo) {
        await uploadFile(`/api/chats/${chat.id}/avatar`, 'avatar', photo.file).catch(() => toast.error('Группа создана, но фото не загрузилось — его можно поставить в настройках группы'));
      }
      await qc.invalidateQueries({ queryKey: chatKeys.list });
      navigate(`/chats/${chat.id}`, { replace: true });
    } catch (e) {
      toast.error(e, 'Не удалось создать группу');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === 'details') setStep('members');
    else if (step === 'members' && params.get('mode') !== 'group') setStep('contacts');
    else navigate('/chats');
  };

  const title = step === 'contacts' ? 'Новое сообщение' : step === 'members' ? (withTopics ? 'Группа с темами' : 'Новая группа') : 'Название и фото';
  const subtitle = step === 'members' ? (selected.length ? `${selected.length} ${plural(selected.length, ['участник', 'участника', 'участников'])}` : 'Выберите участников') : '';

  return (
    <div className={s.wrap}>
      <header className={s.header}>
        <IconButton label="Назад" onClick={back}>
          <ChevronLeft size={26} />
        </IconButton>
        <div className={s.titles}>
          <div className={s.title}>{title}</div>
          {subtitle && <div className={s.subtitle}>{subtitle}</div>}
        </div>
        {step === 'members' && (
          <Button icon={<ArrowRight size={18} />} disabled={!selected.length} onClick={() => setStep('details')}>
            Далее
          </Button>
        )}
        {step === 'details' && (
          <Button loading={busy} disabled={!name.trim()} onClick={createGroup}>
            Создать
          </Button>
        )}
      </header>

      {step === 'contacts' && (
        <>
          <div className={s.actions}>
            <button
              type="button"
              className={s.action}
              onClick={() => {
                setWithTopics(false);
                setStep('members');
              }}
            >
              <span className={s.actionIcon}>
                <Users size={20} />
              </span>
              Новая группа
            </button>
            <button
              type="button"
              className={s.action}
              onClick={() => {
                setWithTopics(true);
                setStep('members');
              }}
            >
              <span className={s.actionIcon}>
                <Layers size={20} />
              </span>
              Группа с темами
            </button>
          </div>
          <UserPicker exclude={[me.id]} onPick={openPrivate} autoFocus />
        </>
      )}

      {step === 'members' && (
        <UserPicker
          exclude={[me.id]}
          multiple
          selected={selected}
          onToggle={(id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
          autoFocus
        />
      )}

      {step === 'details' && (
        <div className={s.details}>
          <div className={s.nameRow}>
            <button type="button" className={s.photo} onClick={() => photoInput.current?.click()} aria-label="Фото группы">
              {photo ? <img src={photo.url} alt="" /> : <Camera size={26} />}
            </button>
            <TextField
              className={s.nameField}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название группы"
              maxLength={255}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
            />
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (f) setPhoto({ file: f, url: URL.createObjectURL(f) });
              }}
            />
          </div>
          <label className={s.option}>
            <span>
              <b>Темы</b>
              <small>Разделить переписку на отдельные ветки, как форум</small>
            </span>
            <Switch checked={withTopics} onChange={setWithTopics} label="Темы" />
          </label>
          <p className={s.hint}>
            {selected.length} {plural(selected.length, ['участник', 'участника', 'участников'])} и вы
          </p>
        </div>
      )}
    </div>
  );
}
