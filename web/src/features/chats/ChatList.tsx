import { useMemo, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, CheckCheck, LogOut, MailOpen, MessageCircle, MoreHorizontal, Pin, PinOff, Plus, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useUsers, usePresence } from '../users/queries';
import { fuzzyMatch } from '../../lib/fuzzy';
import { api } from '../../lib/http';
import { displayName, listTime } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { IconButton } from '../../ui/Button';
import { Chips, SearchField } from '../../ui/Field';
import { EmptyState } from '../../ui/EmptyState';
import { Spinner } from '../../ui/Spinner';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { useFeedback } from '../../ui/feedback';
import { chatKeys, isMuted, useChats } from './queries';
import { MUTE_OPTIONS, markChatRead, removeChat, setChatMute, setChatPinned } from './chatActions';
import { messagePreview } from './model';
import { dismissNotificationsOffer, requestNotifications, shouldOfferNotifications } from './notifications';
import type { Chat } from './types';
import type { Employee } from '../../lib/types';
import s from './ChatList.module.css';

type Filter = 'all' | 'private' | 'groups' | 'unread';

/**
 * Список чатов — как в приложении: закреплённые сверху, непрочитанные,
 * галочки прочтения, «в сети», фильтры, поиск по чатам и сотрудникам,
 * правый клик (или «⋯») — закрепить, прочитать, без звука, удалить/выйти.
 */
export default function ChatList() {
  const { user } = useAuth();
  const meId = user!.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const match = useMatch('/chats/:chatId/*');
  const activeId = match?.params.chatId;
  const { data: chats, isLoading, error, refetch } = useChats();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [offerNotify, setOfferNotify] = useState(shouldOfferNotifications);
  const [menu, setMenu] = useState<{ chat: Chat; anchor: MenuAnchor; mute?: boolean } | null>(null);
  const searching = query.trim().length > 0;
  const { data: users } = useUsers(searching);

  const peerIds = useMemo(() => (chats || []).filter((c) => c.type === 'private' && c.peer).map((c) => c.peer!.id), [chats]);
  const presence = usePresence(peerIds);

  const visible = useMemo(() => {
    let list = chats || [];
    if (filter === 'private') list = list.filter((c) => c.type === 'private');
    if (filter === 'groups') list = list.filter((c) => c.type === 'group');
    if (filter === 'unread') list = list.filter((c) => (c.unread_count || 0) > 0);
    if (searching) {
      list = list
        .map((c) => ({ c, r: fuzzyMatch(c.name || '', query) }))
        .filter((x) => x.r.match)
        .sort((a, b) => a.r.rank - b.r.rank)
        .map((x) => x.c);
    }
    return list;
  }, [chats, filter, query, searching]);

  const people = useMemo(() => {
    if (!searching || !users) return [];
    const withChat = new Set(peerIds);
    return users
      .filter((u) => u.id !== meId && !withChat.has(u.id))
      .map((u) => ({ u, r: fuzzyMatch(`${u.display_name || ''} ${u.username} ${u.role_name || ''}`, query) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .slice(0, 8)
      .map((x) => x.u);
  }, [users, query, searching, peerIds, meId]);

  const unreadChats = (chats || []).filter((c) => (c.unread_count || 0) > 0).length;
  const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.list });

  const startPrivate = async (u: Employee) => {
    try {
      const chat = await api.post<Chat>('/api/chats', { type: 'private', user_ids: [u.id] });
      setQuery('');
      await refresh();
      navigate(`/chats/${chat.id}`);
    } catch (e) {
      toast.error(e, 'Не удалось открыть чат');
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  const askRemove = async (chat: Chat) => {
    if (chat.type === 'private') {
      const ok = await confirm({
        title: 'Удалить чат?',
        text: `Переписка с ${chat.name} исчезнет из вашего списка. У собеседника она останется; если он напишет — чат вернётся.`,
        confirmText: 'Удалить',
        danger: true,
      });
      if (ok) run(() => removeChat(chat.id));
      return;
    }
    const isCreator = chat.created_by === meId;
    if (isCreator) {
      const del = await confirm({
        title: 'Удалить группу для всех?',
        text: 'Группа закроется у всех участников. Если хотите просто выйти — нажмите «Отмена» и выберите «Покинуть»: владельцем станет администратор или самый давний участник.',
        confirmText: 'Удалить для всех',
        danger: true,
      });
      if (del) {
        run(() => removeChat(chat.id));
        if (String(chat.id) === activeId) navigate('/chats');
        return;
      }
    }
    const leave = await confirm({ title: 'Покинуть группу?', text: `Вы перестанете получать сообщения «${chat.name}».`, confirmText: 'Покинуть', danger: true });
    if (leave) {
      run(() => removeChat(chat.id, true));
      if (String(chat.id) === activeId) navigate('/chats');
    }
  };

  const menuItems = (chat: Chat, anchor: MenuAnchor): MenuItem[] => [
    {
      key: 'pin',
      label: chat.pinned_at ? 'Открепить' : 'Закрепить',
      icon: chat.pinned_at ? <PinOff size={18} /> : <Pin size={18} />,
      onSelect: () => run(() => setChatPinned(chat.id, !chat.pinned_at)),
    },
    ...((chat.unread_count || 0) > 0 && chat.last_message
      ? [{ key: 'read', label: 'Отметить прочитанным', icon: <MailOpen size={18} />, onSelect: () => run(() => markChatRead(chat.id, chat.last_message!.id)) }]
      : []),
    isMuted(chat.muted_until)
      ? { key: 'unmute', label: 'Включить уведомления', icon: <Bell size={18} />, onSelect: () => run(() => setChatMute(chat.id, 0)) }
      : { key: 'mute', label: 'Без звука…', icon: <BellOff size={18} />, onSelect: () => setMenu({ chat, anchor, mute: true }) },
    {
      key: 'remove',
      label: chat.type === 'private' ? 'Удалить чат' : chat.created_by === meId ? 'Удалить или покинуть' : 'Покинуть группу',
      icon: chat.type === 'private' ? <Trash2 size={18} /> : <LogOut size={18} />,
      danger: true,
      onSelect: () => askRemove(chat),
    },
  ];

  const muteItems = (chat: Chat): MenuItem[] =>
    MUTE_OPTIONS.map((o) => ({ key: o.key, label: o.label, icon: <BellOff size={18} />, onSelect: () => run(() => setChatMute(chat.id, o.ms)) }));

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <div className={s.titles}>
          <h1 className={`${s.title} display-title`}>Чаты</h1>
          {user?.company_name && <div className={s.company}>{user.company_name}</div>}
        </div>
        <IconButton label="Новый чат" tone="soft" size={42} onClick={() => navigate('/chats/new')}>
          <Plus size={22} />
        </IconButton>
      </div>
      <div className={s.search}>
        <SearchField value={query} onChange={setQuery} placeholder="Поиск чатов и сотрудников" />
      </div>
      <Chips
        className={s.filters}
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'all', label: 'Все' },
          { key: 'private', label: 'Личные' },
          { key: 'groups', label: 'Группы' },
          { key: 'unread', label: `Непрочитанные${unreadChats ? ` ${unreadChats}` : ''}` },
        ]}
      />

      {offerNotify && (
        <div className={s.notify}>
          <Bell size={18} className={s.notifyIcon} />
          <button
            type="button"
            className={s.notifyText}
            onClick={async () => {
              await requestNotifications();
              setOfferNotify(false);
            }}
          >
            Включить уведомления о новых сообщениях
          </button>
          <button
            type="button"
            className={s.notifyClose}
            aria-label="Не сейчас"
            onClick={() => {
              dismissNotificationsOffer();
              setOfferNotify(false);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className={s.scroll}>
        {people.length > 0 && (
          <>
            <div className={s.section}>Сотрудники</div>
            {people.map((u) => (
              <button key={u.id} type="button" className={s.row} onClick={() => startPrivate(u)}>
                <Avatar name={displayName(u)} src={u.avatar_url} size={50} />
                <div className={s.body}>
                  <div className={s.name}>{displayName(u)}</div>
                  <div className={s.preview}>{u.role_name || `@${u.username}`} · написать</div>
                </div>
              </button>
            ))}
            {visible.length > 0 && <div className={s.section}>Чаты</div>}
          </>
        )}

        {isLoading && !chats ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : visible.length === 0 && people.length === 0 ? (
          <EmptyState
            compact
            icon={<MessageCircle size={40} strokeWidth={1.5} />}
            title={error ? 'Нет связи' : searching ? 'Ничего не найдено' : filter === 'unread' ? 'Всё прочитано' : 'Пока нет чатов'}
            text={
              error ? (
                <button type="button" className={s.retry} onClick={() => refetch()}>
                  Повторить
                </button>
              ) : searching ? (
                'Попробуйте другой запрос'
              ) : filter !== 'all' ? (
                'В этом разделе пусто'
              ) : (
                'Нажмите «+», чтобы написать коллеге или создать группу'
              )
            }
          />
        ) : (
          visible.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              meId={meId}
              active={String(chat.id) === activeId}
              online={chat.type === 'private' && !!chat.peer && !!presence.get(chat.peer.id)?.online}
              onOpen={() => navigate(`/chats/${chat.id}`)}
              onMenu={(anchor) => setMenu({ chat, anchor })}
            />
          ))
        )}
      </div>

      <ActionMenu
        open={!!menu}
        anchor={menu?.anchor || null}
        title={menu ? (menu.mute ? `Уведомления: ${menu.chat.name}` : menu.chat.name || '') : ''}
        items={menu ? (menu.mute ? muteItems(menu.chat) : menuItems(menu.chat, menu.anchor)) : []}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

function ChatRow({
  chat,
  meId,
  active,
  online,
  onOpen,
  onMenu,
}: {
  chat: Chat;
  meId: number;
  active: boolean;
  online: boolean;
  onOpen: () => void;
  onMenu: (anchor: MenuAnchor) => void;
}) {
  const lm = chat.last_message;
  const unread = chat.unread_count || 0;
  const muted = isMuted(chat.muted_until);
  const mineLast = !!lm && lm.sender_id === meId && lm.content_type !== 'service';
  const read = mineLast && lm!.id <= (chat.peer_last_read_id || 0);
  let prefix = '';
  let text: string;
  if (!lm) text = chat.type === 'group' ? 'Группа создана' : 'Нет сообщений';
  else if (lm.content_type === 'service') text = lm.text || '';
  else {
    text = messagePreview(lm);
    prefix = lm.sender_id === meId ? 'Вы: ' : chat.type === 'group' && lm.sender_name ? `${lm.sender_name.split(' ')[0]}: ` : '';
  }
  return (
    <div
      className={[s.row, active && s.active].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(anchorFrom(e));
      }}
    >
      <Avatar name={chat.name} src={chat.avatar_url} size={54} online={online} />
      <div className={s.body}>
        <div className={s.top}>
          {chat.type === 'group' && <Users size={15} className={s.muted} />}
          <span className={s.name}>{chat.name || 'Чат'}</span>
          {muted && <BellOff size={14} className={s.muted} />}
          {mineLast && (read ? <CheckCheck size={16} className={s.tick} /> : <Check size={15} className={s.tick} />)}
          <span className={[s.time, unread > 0 && !muted && s.timeUnread].filter(Boolean).join(' ')}>{listTime(lm?.created_at || chat.created_at)}</span>
        </div>
        <div className={s.bottom}>
          <span className={s.preview}>
            {prefix && <span className={s.prefix}>{prefix}</span>}
            {text}
          </span>
          {unread > 0 ? (
            <span className={[s.badge, muted && s.badgeMuted].filter(Boolean).join(' ')}>{unread > 99 ? '99+' : unread}</span>
          ) : chat.pinned_at ? (
            <Pin size={15} className={s.pin} />
          ) : null}
          <button
            type="button"
            className={s.more}
            aria-label="Действия с чатом"
            onClick={(e) => {
              e.stopPropagation();
              onMenu(anchorFrom(e.currentTarget));
            }}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
