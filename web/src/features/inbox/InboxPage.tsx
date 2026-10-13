import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Bell as BellIcon, Check, ClipboardCheck, HandHeart, NotebookPen, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '../../lib/http';
import { Avatar } from '../../ui/Avatar';
import { IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Page, PageBody, PageHeader } from '../../ui/Page';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { linkFor, NOTE_COLOR, UNREAD_KEY, type AppNotification } from './api';
import s from './inbox.module.css';

type Filter = 'all' | 'tasks' | 'notes';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'tasks', label: 'Задачи' },
  { key: 'notes', label: 'Заметки' },
];
const PAGE = 40;
const IMPORTANCE: Record<string, string> = { red: '#DC2626', yellow: '#D97706', green: '#16A34A' };

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function dayTitle(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date();
  y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return 'Сегодня';
  if (dayKey(d) === dayKey(y)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'сейчас';
  if (min < 60) return `${min} мин`;
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
const shortDeadline = (iso?: string | null) =>
  iso ? `${new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '';

/** Колокольчик: новые задачи и запросы заметок. Открыли — всё прочитано, новое подсвечено. */
export default function InboxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<Filter>('all');
  const fresh = useRef(new Set<number>());

  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) => api.get<AppNotification[]>('/api/notifications', pageParam ? { before: pageParam } : undefined),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length >= PAGE ? last[last.length - 1].id : undefined),
  });
  const items = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);

  // Всё, что было новым, — прочитано; подсветка остаётся, пока экран открыт.
  useEffect(() => {
    const unread = items.filter((n) => !n.read_at && !fresh.current.has(n.id));
    if (!unread.length) return;
    unread.forEach((n) => fresh.current.add(n.id));
    api
      .post<{ count: number }>('/api/notifications/read', { ids: unread.map((n) => n.id) })
      .then((r) => qc.setQueryData(UNREAD_KEY, { count: r.count }))
      .catch(() => undefined);
  }, [items, qc]);

  const sections = useMemo(() => {
    const list = items.filter((n) => (filter === 'all' ? true : filter === 'tasks' ? n.kind === 'task' : n.kind !== 'task'));
    const out: { title: string; data: AppNotification[] }[] = [];
    for (const n of list) {
      const title = dayTitle(n.created_at);
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(n);
      else out.push({ title, data: [n] });
    }
    return out;
  }, [items, filter]);

  const clearAll = async () => {
    if (!(await confirm({ title: 'Очистить уведомления?', text: 'Список станет пустым. Задачи и заметки останутся на месте.', confirmText: 'Очистить', danger: true }))) return;
    try {
      await api.delete('/api/notifications');
      qc.setQueryData(UNREAD_KEY, { count: 0 });
      qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
    } catch (e) {
      toast.error(e, 'Не удалось очистить');
    }
  };

  return (
    <Page>
      <PageHeader
        title="Уведомления"
        back={true}
        actions={
          items.length ? (
            <IconButton label="Очистить всё" onClick={clearAll}>
              <Trash2 size={19} />
            </IconButton>
          ) : undefined
        }
      >
        <div className={s.filters}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={[s.chip, filter === f.key && s.chipOn].filter(Boolean).join(' ')} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </PageHeader>
      <PageBody narrow>
        {q.isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : !sections.length ? (
          <EmptyState
            icon={<BellIcon size={34} />}
            title="Пока тихо"
            text={
              filter === 'notes'
                ? 'Здесь появятся запросы текущей версии ваших заметок и ответы на ваши запросы.'
                : filter === 'tasks'
                  ? 'Здесь появятся новые задачи и итоги проверки.'
                  : 'Здесь появятся новые задачи, запросы заметок и ответы на них.'
            }
          />
        ) : (
          <>
            {sections.map((sec) => (
              <section key={sec.title}>
                <div className={s.section}>{sec.title}</div>
                {sec.data.map((n) => (
                  <Item
                    key={n.id}
                    n={n}
                    fresh={fresh.current.has(n.id)}
                    onOpen={() => {
                      const to = linkFor(n);
                      if (to) navigate(to);
                    }}
                  />
                ))}
              </section>
            ))}
            {q.hasNextPage && (
              <button type="button" className={s.more} onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                {q.isFetchingNextPage ? <Spinner size={16} /> : 'Показать ещё'}
              </button>
            )}
          </>
        )}
      </PageBody>
    </Page>
  );
}

function Item({ n, fresh, onOpen }: { n: AppNotification; fresh: boolean; onOpen: () => void }) {
  const isTask = n.kind === 'task';
  const who = n.actor_name || 'Коллега';
  const isRequest = isTask && n.data?.kind === 'request';
  const badge = isRequest
    ? { color: 'var(--c-violet)', Icon: HandHeart }
    : isTask
    ? { color: IMPORTANCE[n.data?.importance] || IMPORTANCE.yellow, Icon: ClipboardCheck }
    : n.kind === 'note_request'
      ? { color: NOTE_COLOR, Icon: RefreshCw }
      : n.kind === 'note_request_approved'
        ? { color: 'var(--c-success)', Icon: Check }
        : { color: 'var(--c-text-muted)', Icon: X };
  const deadline = isTask ? shortDeadline(n.data?.deadline) : '';

  return (
    <button type="button" className={[s.item, fresh && s.itemFresh].filter(Boolean).join(' ')} onClick={onOpen}>
      <span className={s.avatarWrap}>
        <Avatar name={who} src={n.actor_avatar_url} size={46} />
        <span className={s.kindBadge} style={{ background: badge.color }}>
          <badge.Icon size={11} strokeWidth={3} />
        </span>
      </span>
      <span className={s.itemBody}>
        <span className={s.itemTop}>
          <span className={s.headline}>
            {isTask ? (
              n.title
            ) : n.kind === 'note_request' ? (
              <>
                <b>{who}</b> просит текущую версию заметки
              </>
            ) : n.kind === 'note_request_approved' ? (
              <>
                <b>{who}</b> поделился(ась) текущей версией
              </>
            ) : (
              <>
                <b>{who}</b> не стал(а) делиться новой версией
              </>
            )}
          </span>
          <span className={s.time}>{timeAgo(n.created_at)}</span>
          {fresh && <span className={s.dot} />}
        </span>
        {isTask ? (
          <>
            <span className={s.taskTitle}>{n.body}</span>
            <span className={s.meta}>{[n.actor_name ? `от ${n.actor_name}` : '', deadline ? `срок ${deadline}` : ''].filter(Boolean).join(' · ')}</span>
            {n.data?.comment ? <span className={s.comment}>«{n.data.comment}»</span> : null}
          </>
        ) : (
          <span className={s.noteChip}>
            <NotebookPen size={14} color={NOTE_COLOR} />
            <span>{n.body || 'Без названия'}</span>
          </span>
        )}
        {n.kind === 'note_request' &&
          (n.request_status === 'pending' ? (
            <span className={s.statusBtn}>Посмотреть и ответить</span>
          ) : n.request_status === 'approved' ? (
            <span className={[s.statusPill, s.statusOk].join(' ')}>
              <Check size={13} strokeWidth={2.8} /> Вы поделились
            </span>
          ) : n.request_status === 'declined' ? (
            <span className={s.statusPill}>
              <X size={13} strokeWidth={2.8} /> Вы отклонили
            </span>
          ) : null)}
        {n.kind === 'note_request_approved' && <span className={[s.meta, s.okText].join(' ')}>Новая копия уже в ваших заметках — откройте</span>}
      </span>
    </button>
  );
}
