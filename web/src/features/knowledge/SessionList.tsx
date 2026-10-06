import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Trash2 } from 'lucide-react';
import { api } from '../../lib/http';
import { listTime } from '../../lib/format';
import { IconButton } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { kbKeys, useKbSessions } from './queries';
import s from './knowledge.module.css';

/** Диалоги с ассистентом: последний ответ, дата, удаление. */
export function SessionList({ activeId, onPicked }: { activeId: number; onPicked?: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { confirm, toast } = useFeedback();
  const { data, isLoading, error, refetch } = useKbSessions();

  const remove = async (id: number, title: string) => {
    if (!(await confirm({ title: 'Удалить диалог?', text: `«${title}» и все ответы в нём будут удалены.`, confirmText: 'Удалить', danger: true }))) return;
    try {
      await api.delete(`/api/knowledge/sessions/${id}`);
      qc.setQueryData(kbKeys.sessions, (old: { id: number }[] | undefined) => old?.filter((x) => x.id !== id));
      qc.removeQueries({ queryKey: kbKeys.messages(id) });
      if (id === activeId) navigate('/knowledge/new', { replace: true });
      toast.success('Диалог удалён');
    } catch (e) {
      toast.error(e, 'Не удалось удалить диалог');
    }
  };

  if (isLoading) {
    return (
      <div className={s.center}>
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <button type="button" className={s.retry} onClick={() => refetch()}>
        Не удалось загрузить диалоги. Повторить
      </button>
    );
  }
  if (!data?.length) return <p className={s.listEmpty}>Здесь появятся ваши вопросы ассистенту.</p>;

  return (
    <ul className={s.sessions}>
      {data.map((x) => (
        <li key={x.id} className={[s.session, x.id === activeId && s.sessionActive].filter(Boolean).join(' ')}>
          <button
            type="button"
            className={s.sessionMain}
            onClick={() => {
              navigate(`/knowledge/${x.id}`);
              onPicked?.();
            }}
          >
            <span className={s.sessionIcon}>
              <MessageSquareText size={18} />
            </span>
            <span className={s.sessionBody}>
              <span className={s.sessionTop}>
                <b>{x.title || 'Диалог'}</b>
                <time>{listTime(x.updated_at)}</time>
              </span>
              {x.last_message && <span className={s.sessionLast}>{x.last_message.replace(/\*\*/g, '')}</span>}
            </span>
          </button>
          <IconButton label="Удалить диалог" size={32} className={s.sessionDelete} onClick={() => remove(x.id, x.title)}>
            <Trash2 size={16} />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}
