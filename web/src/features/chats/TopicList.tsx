import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Info, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api } from '../../lib/http';
import { subscribe } from '../../lib/socket';
import { listTime, plural } from '../../lib/format';
import { useIsMobile } from '../../lib/useMedia';
import { Avatar } from '../../ui/Avatar';
import { IconButton } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { useFeedback } from '../../ui/feedback';
import { chatKeys, useChatDetail, useTopics } from './queries';
import { messagePreview } from './model';
import { TopicIcon } from './topicIcons';
import TopicEditor from './TopicEditor';
import type { LastMessage, Message, Topic } from './types';
import s from './TopicList.module.css';

/**
 * Группа с темами (как форумы в Telegram): сверху «Общий», ниже темы
 * с последним сообщением. Создавать темы могут все, менять и удалять —
 * автор темы и те, кто может менять группу.
 */
export default function TopicList() {
  const { chatId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { toast, confirm } = useFeedback();
  const { data: chat } = useChatDetail(chatId);
  const { data: topics, isLoading } = useTopics(chatId, { live: true });
  const [editor, setEditor] = useState<{ topic: Topic | null } | null>(null);
  const [menu, setMenu] = useState<{ topic: Topic; anchor: MenuAnchor } | null>(null);

  // Последнее сообщение «Общего» (без темы).
  const general = useQuery({
    queryKey: ['messages-general-last', chatId],
    queryFn: () => api.get<Message[]>(`/api/messages/${chatId}`, { limit: 1 }).then((r) => r[r.length - 1] ?? null),
    staleTime: 0,
  });
  const refetchGeneral = general.refetch;
  useEffect(
    () => subscribe<{ chat_id: number | string }>('chat_activity', (e) => String(e.chat_id) === chatId && refetchGeneral()),
    [chatId, refetchGeneral],
  );

  // Темы выключили, пока экран открыт, — переходим в обычный чат.
  useEffect(() => {
    if (!chat || chat.is_supergroup) return;
    qc.invalidateQueries({ queryKey: chatKeys.list });
    navigate(`/chats/${chatId}`, { replace: true });
  }, [chat, chatId, navigate, qc]);

  const canManage = (t: Topic) => t.created_by === me.id || !!chat?.my_rights.can_change_info;
  const name = chat?.name || 'Группа';
  const members = chat?.members_count || chat?.members.length || 0;

  const remove = async (t: Topic) => {
    if (!(await confirm({ title: 'Удалить тему?', text: 'Тема исчезнет у всех участников. Сообщения не удаляются — они остаются в архиве группы.', confirmText: 'Удалить', danger: true }))) return;
    try {
      await api.delete(`/api/topics/${t.id}`);
      qc.invalidateQueries({ queryKey: chatKeys.topics(chatId) });
    } catch (e) {
      toast.error(e, 'Не удалось удалить тему');
    }
  };

  const menuItems = (t: Topic): MenuItem[] => [
    { key: 'info', label: 'О теме', icon: <Info size={19} />, onSelect: () => navigate(`/chats/${chatId}/topic/${t.id}/info`) },
    ...(canManage(t)
      ? [
          { key: 'edit', label: 'Изменить', icon: <Pencil size={19} />, onSelect: () => setEditor({ topic: t }) },
          { key: 'delete', label: 'Удалить тему', danger: true, icon: <Trash2 size={19} />, onSelect: () => remove(t) },
        ]
      : []),
  ];

  const rows: { topic: Topic | null; last: LastMessage | Message | null | undefined }[] = [
    { topic: null, last: general.data },
    ...(topics || []).map((t) => ({ topic: t, last: t.last_message })),
  ];

  return (
    <div className={s.wrap}>
      <header className={s.header}>
        {isMobile && (
          <IconButton label="Назад" onClick={() => navigate('/chats')}>
            <ChevronLeft size={26} />
          </IconButton>
        )}
        <button type="button" className={s.headerMain} onClick={() => navigate(`/chats/${chatId}/info`)}>
          <Avatar name={name} src={chat?.avatar_url} size={40} />
          <span className={s.titles}>
            <span className={s.title}>{name}</span>
            <span className={s.subtitle}>
              {topics?.length ?? 0} {plural(topics?.length ?? 0, ['тема', 'темы', 'тем'])} · {members} {plural(members, ['участник', 'участника', 'участников'])}
            </span>
          </span>
        </button>
        <IconButton label="Новая тема" onClick={() => setEditor({ topic: null })}>
          <Plus size={22} />
        </IconButton>
        <IconButton label="Информация о группе" onClick={() => navigate(`/chats/${chatId}/info`)}>
          <Info size={21} />
        </IconButton>
      </header>

      <div className={s.list}>
        {isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : (
          <>
            {rows.map(({ topic, last }) => (
              <div
                key={topic?.id ?? 0}
                role="button"
                tabIndex={0}
                className={s.row}
                onClick={() => navigate(`/chats/${chatId}/topic/${topic?.id ?? 0}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/chats/${chatId}/topic/${topic?.id ?? 0}`)}
                onContextMenu={(e) => {
                  if (!topic) return;
                  e.preventDefault();
                  setMenu({ topic, anchor: { x: e.clientX, y: e.clientY } });
                }}
              >
                <TopicIcon topic={topic} size={46} />
                <span className={s.body}>
                  <span className={s.top}>
                    <span className={s.name}>{topic?.title || 'Общий'}</span>
                    <span className={s.time}>{listTime(last?.created_at)}</span>
                  </span>
                  <span className={s.preview}>
                    {last ? (
                      <>
                        {lastSender(last) && <span className={s.prefix}>{lastSender(last)}: </span>}
                        {messagePreview(last)}
                      </>
                    ) : topic ? (
                      'Пока нет сообщений'
                    ) : (
                      'Сообщения без темы'
                    )}
                  </span>
                </span>
                {topic && (
                  <button
                    type="button"
                    className={s.more}
                    aria-label="Действия с темой"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu({ topic, anchor: anchorFrom(e.currentTarget) });
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                )}
              </div>
            ))}
            {topics?.length === 0 && <p className={s.hint}>Тем пока нет. Создайте первую — например, «Отчёты» или «Вопросы».</p>}
          </>
        )}
      </div>

      <ActionMenu open={!!menu} anchor={menu?.anchor ?? null} title={menu?.topic.title} items={menu ? menuItems(menu.topic) : []} onClose={() => setMenu(null)} />
      <TopicEditor
        open={!!editor}
        chatId={chatId}
        topic={editor?.topic ?? null}
        onClose={() => setEditor(null)}
        onSaved={(t) => {
          qc.invalidateQueries({ queryKey: chatKeys.topics(chatId) });
          if (!editor?.topic) navigate(`/chats/${chatId}/topic/${t.id}`);
        }}
      />
    </div>
  );
}

function lastSender(m: LastMessage | Message): string {
  if (m.content_type === 'service') return '';
  const name = ('sender_display_name' in m && m.sender_display_name) || m.sender_name;
  return name ? name.split(' ')[0] : '';
}
